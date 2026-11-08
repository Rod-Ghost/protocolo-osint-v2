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
from datetime import datetime, timedelta, timezone

from .engine_hub import ENGINES, EngineError, _validate
from .engine_worker_runtime import run_worker_engine

TOPIC = "protocolo-osint-engine-v1"
GROUP = "protocolo-engine-workers"
UUID_RE = re.compile(r"^[0-9a-f]{32}$")


def _authorized(authenticated: bool) -> bool:
    # Must be passed only after validating a request-scoped administrator identity.
    # Never substitute a global environment flag for per-request authentication.
    return authenticated is True and os.environ.get("OSINT_ENGINE_QUEUE_ENABLED") == "1"


def validate_job(engine: str, target: str) -> dict:
    spec = next((e for e in ENGINES if e.id == engine), None)
    if not spec:
        raise EngineError("Motor inexistente.")
    return {"engine": engine, "target": _validate(spec, target)}


async def submit(engine: str, target: str, *, authenticated: bool = False, sender=None) -> dict:
    """Submit a single target after a *server-verified* admin session."""
    if not _authorized(authenticated):
        raise EngineError("Fila desligada ou usuário não autenticado.")
    clean = validate_job(engine, target)
    job_id = uuid.uuid4().hex
    if sender is None:
        from vercel.queue import send
        sender = send
    message = {"job_id": job_id, **clean, "issued_at": datetime.now(timezone.utc).isoformat()}
    await sender(TOPIC, message, idempotency_key=job_id, retention=timedelta(hours=1))
    return {"job_id": job_id, "status": "queued", "engine": engine, "notice": "Enfileirado; conclusão depende da disponibilidade real do daemon."}


async def process_job(payload: dict, *, engine_runner=run_worker_engine, blob_writer=None) -> dict:
    """Process one validated queue delivery; persist result in PRIVATE Blob."""
    if not isinstance(payload, dict) or not UUID_RE.fullmatch(str(payload.get("job_id", ""))):
        raise EngineError("Identificador de tarefa inválido.")
    item = validate_job(str(payload.get("engine", "")), str(payload.get("target", "")))
    job_id = payload["job_id"]
    try:
        output = await asyncio.to_thread(engine_runner, item["engine"], item["target"])
    except EngineError as exc:
        output = {"status": "failed", "engine": item["engine"], "error": str(exc)[:180], "records": []}
    record = {"job_id": job_id, "completed_at": datetime.now(timezone.utc).isoformat(), **output}
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


async def worker_loop(*, poller=None, sleeper=asyncio.sleep):
    """Long-lived pull worker. Do not run inside request/response Functions."""
    if os.environ.get("OSINT_WORKER_AUTHORIZED") != "1":
        raise EngineError("Worker precisa ser ativado em instância isolada.")
    if poller is None:
        from vercel.queue import poll
        poller = poll
    os.environ.setdefault("VERCEL_REGION", "gru1")
    while True:
        async for delivery in poller(topic=TOPIC, consumer_group=GROUP, limit=1):
            async with delivery as message:
                await process_job(message.payload)
        await sleeper(2)


def main():
    asyncio.run(worker_loop())


if __name__ == "__main__":
    main()
