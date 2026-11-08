"""Vercel Queue + Private Blob adapter; uses official Python SDK lazily.

No public unauthenticated entrypoint is provided. Values are one username/domain,
never whole evidence or files. This module is tested using injected substitutes.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
import time
from datetime import datetime, timedelta, timezone

from .engine_hub import ENGINES, EngineError, _validate
from .engine_worker_runtime import run_worker_engine, inventory as worker_inventory
from .target_routing import validate_target, SPIDERFOOT_KINDS

TOPIC = "protocolo-osint-engine-v1"
GROUP = "protocolo-engine-workers"
UUID_RE = re.compile(r"^[0-9a-f]{32}$")

# All queue producers/consumers MUST use the same region and deployment
# namespace. Functions and Daemons have different deployment identifiers.
QUEUE_REGION = "gru1"

# Hobby free-tier budget: writing a heartbeat once per minute would exhaust
# the monthly Private Blob advanced-operation allowance in ~33 hours.
HEARTBEAT_INTERVAL_SECONDS = 30 * 60
HEARTBEAT_FRESHNESS_SECONDS = 50 * 60
QUEUE_IDLE_POLL_SECONDS = 30


def _queue_client():
    """Use one explicitly scoped queue across serverless + daemon deployments.

    The SDK gets scoped OIDC credentials from Vercel; never commit tokens.
    """
    from vercel.queue import ALL_DEPLOYMENTS, QueueClient
    return QueueClient(region=QUEUE_REGION, deployment=ALL_DEPLOYMENTS)



def _authorized(authenticated: bool) -> bool:
    # Must be passed only after validating a request-scoped administrator identity.
    # Never substitute a global environment flag for per-request authentication.
    return authenticated is True and os.environ.get("OSINT_ENGINE_QUEUE_ENABLED") == "1"


def validate_job(engine: str, target: str, *, target_kind: str | None = None) -> dict:
    spec = next((e for e in ENGINES if e.id == engine), None)
    if not spec:
        raise EngineError("Motor inexistente.")
    if engine == "spiderfoot" and target_kind is not None:
        resolved = validate_target(target, target_kind)
        if resolved.engine_kind not in SPIDERFOOT_KINDS:
            raise EngineError("Tipo não suportado pelo SpiderFoot.")
        return {"engine": engine, "target": resolved.normalized,
                "target_kind": resolved.engine_kind}
    if target_kind is not None:
        raise EngineError("Esse motor não suporta o tipo solicitado.")
    return {"engine": engine, "target": _validate(spec, target)}


async def submit(engine: str, target: str, *, authenticated: bool = False, sender=None, operator_id: int | None = None, target_kind: str | None = None) -> dict:
    """Submit a single target after a *server-verified* admin session."""
    if not _authorized(authenticated):
        raise EngineError("Fila desligada ou usuário não autenticado.")
    clean = validate_job(engine, target, target_kind=target_kind)
    job_id = uuid.uuid4().hex
    if sender is None:
        sender = _queue_client().send
    message = {"job_id": job_id, **clean, "issued_at": datetime.now(timezone.utc).isoformat()}
    if operator_id is not None:
        if not isinstance(operator_id, int) or operator_id <= 0:
            raise EngineError("Identificador do operador inválido.")
        message["operator_id"] = operator_id
    await sender(TOPIC, message, idempotency_key=job_id, retention=timedelta(hours=1))
    return {"job_id": job_id, "status": "queued", "engine": engine, "notice": "Enfileirado; conclusão depende da disponibilidade real do daemon."}


async def _read_completed_record(job_id: str) -> dict | None:
    """Read a previously persisted result before retrying an at-least-once job."""
    from vercel.blob import BlobNotFoundError, get_blob
    try:
        item = await get_blob(f"osint-jobs/{job_id}/result.json", access="private")
    except BlobNotFoundError:
        return None
    record = json.loads(item.body)
    if not isinstance(record, dict) or record.get("job_id") != job_id:
        raise EngineError("Resultado privado inconsistente; tarefa não repetida.")
    return record


async def process_job(payload: dict, *, engine_runner=run_worker_engine,
                      blob_writer=None, completed_reader=None) -> dict:
    """Process one validated queue delivery; persist result in PRIVATE Blob."""
    if not isinstance(payload, dict) or not UUID_RE.fullmatch(str(payload.get("job_id", ""))):
        raise EngineError("Identificador de tarefa inválido.")
    item = validate_job(str(payload.get("engine", "")), str(payload.get("target", "")),
                        target_kind=payload.get("target_kind"))
    job_id = payload["job_id"]
    # An acknowledged result must not be collected again on queue redelivery.
    # When a test supplies an in-memory writer, skip the live Blob read unless
    # the caller also injects a reader.
    if completed_reader is not None or blob_writer is None:
        reader = completed_reader or _read_completed_record
        previous = await reader(job_id)
        if previous is not None:
            return previous
    try:
        if "target_kind" in item:
            output = await asyncio.to_thread(
                engine_runner, item["engine"], item["target"],
                target_kind=item["target_kind"]
            )
        else:
            output = await asyncio.to_thread(engine_runner, item["engine"], item["target"])
    except EngineError as exc:
        output = {"status": "failed", "engine": item["engine"], "error": str(exc)[:180], "records": []}
    record = {"job_id": job_id, "completed_at": datetime.now(timezone.utc).isoformat(), **output}
    if "target_kind" in item:
        record["target_kind"] = item["target_kind"]
    if isinstance(payload.get("operator_id"), int) and payload["operator_id"] > 0:
        record["operator_id"] = payload["operator_id"]
    data = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(data) > 120000:
        record["stdout_excerpt"] = "[saída reduzida por limite de persistência]"
        record["records"] = record.get("records", [])[:30]
        data = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if blob_writer is None:
        from vercel.blob import put_blob
        blob_writer = put_blob
    await blob_writer(f"osint-jobs/{job_id}/result.json", data, access="private", content_type="application/json", allow_overwrite=False)
    return record


async def publish_heartbeat(*, writer=None):
    """Publish actual executable presence; no names, targets or private data."""
    payload = {"observed_at": datetime.now(timezone.utc).isoformat(), "engines": worker_inventory()}
    if writer is None:
        from vercel.blob import put_blob
        writer = put_blob
    await writer("osint-health/worker.json",
                 json.dumps(payload, separators=(",", ":")).encode("utf-8"),
                 access="private", content_type="application/json", allow_overwrite=True)
    return payload


async def worker_loop(*, poller=None, sleeper=asyncio.sleep):
    """Long-lived pull worker. Do not run inside request/response Functions."""
    if os.environ.get("OSINT_WORKER_AUTHORIZED") != "1":
        raise EngineError("Worker precisa ser ativado em instância isolada.")
    if poller is None:
        poller = _queue_client().poll
    os.environ.setdefault("VERCEL_REGION", QUEUE_REGION)
    last_heartbeat = 0.0
    while True:
        if time.monotonic() - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
            await publish_heartbeat()
            last_heartbeat = time.monotonic()
        async for delivery in poller(topic=TOPIC, consumer_group=GROUP, limit=1):
            async with delivery as message:
                await process_job(message.payload)
        await sleeper(QUEUE_IDLE_POLL_SECONDS)


def main():
    asyncio.run(worker_loop())


if __name__ == "__main__":
    main()
