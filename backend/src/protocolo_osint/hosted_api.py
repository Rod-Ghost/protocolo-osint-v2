"""Safe public Vercel surface. No local SQLite or multi-user endpoints here.

This module is intentionally separate from main.py, the full local application.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
import hmac
import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .catalog import SOURCES, list_sources, plan
from .investigation_lab import analyze as lab_analyze, OPERATIONS as LAB_OPERATIONS
from .detection import detect_type
from .live_lookup import PROVIDERS, LookupError, lookup
from .engine_hub import EngineError, execute as execute_engine, inventory as engine_inventory
from .image_routes import router as image_router
from .mcp_remote_server import mcp as remote_mcp, server_app as mcp_server_app
from .engine_queue import submit as queue_submit, UUID_RE as JOB_UUID_RE

VERSION = "1.2.0"
ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "public"

@asynccontextmanager
async def app_lifespan(_app):
    async with remote_mcp.session_manager.run():
        yield


app = FastAPI(title="Protocolo OSINT V2 — API pública", version=VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=app_lifespan)
app.include_router(image_router)


class SearchRequest(BaseModel):
    value: str = Field(min_length=1, max_length=512)
    category: str | None = Field(default=None, max_length=80)


class LookupRequest(BaseModel):
    value: str = Field(min_length=1, max_length=253)
    provider: Literal["dns", "certificates", "github"]


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; connect-src 'self' https: http://127.0.0.1:11434 http://localhost:11434; worker-src 'self' blob:; object-src 'none'; "
        "base-uri 'self'; frame-ancestors 'none'"
    )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/", include_in_schema=False)
def home():
    if PUBLIC.joinpath("index.html").is_file():
        return FileResponse(PUBLIC / "index.html", media_type="text/html")
    raise HTTPException(404, "Frontend não incluído neste deploy.")


class LabRequest(BaseModel):
    operation: str = Field(min_length=2,max_length=40)
    payload: dict = Field(default_factory=dict)

@app.get("/api/v1/lab/capabilities")
def lab_capabilities():
    return {"operations":list(LAB_OPERATIONS),"mode":"offline-stateless",
            "persistence":False,"external_requests":0,
            "warning":"Resultados locais derivados de entradas do operador; não comprovam fontes."}

@app.post("/api/v1/lab/analyze")
def lab_analyze_route(request:LabRequest):
    try:
        result=lab_analyze(request.operation,request.payload)
    except (ValueError,TypeError,OverflowError) as exc:
        raise HTTPException(422,str(exc)) from exc
    return {"operation":request.operation,"result":result,"persistence":False}


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "version": VERSION, "mode": "hosted-public", "case_storage": False, "image_reverse": "optional"}


@app.get("/api/v1/summary")
def summary():
    return {"sources": len(SOURCES), "categories": len({s.category for s in SOURCES}), "cases": 0,
            "evidence": 0, "online_integrations": len(PROVIDERS), "mode": "hosted-public"}


@app.get("/api/v1/sources")
def sources(kind: str | None = None, category: str | None = None, q: str | None = None):
    return {"sources": list_sources(kind, category, q), "total": len(SOURCES),
            "validation": "Links para destinos externos não verificados nesta execução."}


@app.get("/api/v1/lookup/providers")
def providers():
    return {"providers": [{"id": key, **data, "status": "configured"} for key, data in PROVIDERS.items()],
            "notice": "Requer consentimento de consulta; não é varredura automática."}


@app.post("/api/v1/detect")
def detect(payload: SearchRequest):
    try:
        kind = detect_type(payload.value)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"kind": kind, "value": payload.value.strip(), "external_requests": 0}


@app.post("/api/v1/search/plan")
def search(payload: SearchRequest):
    try:
        kind = detect_type(payload.value)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    results = plan(payload.value, kind, payload.category)
    return {"query": payload.value.strip(), "kind": kind, "results": results, "total": len(results),
            "external_requests": 0, "notice": "Links preparados; não houve consulta remota automática."}


@app.post("/api/v1/lookup")
def live_lookup(payload: LookupRequest):
    try:
        return lookup(payload.value, payload.provider)
    except LookupError as exc:
        raise HTTPException(422 if "exige" in str(exc).lower() or "username" in str(exc).lower() else 502, str(exc)) from exc



class EngineRequest(BaseModel):
    engine: Literal["sherlock", "maigret", "subfinder", "amass", "spiderfoot"]
    value: str = Field(min_length=2, max_length=253)


@app.get("/api/v1/engines")
async def engine_status():
    """Inspect both HTTP runtime and verified PRIVATE worker heartbeat."""
    items = engine_inventory()
    heartbeat = await engine_queue_capabilities()
    if heartbeat.get("workers_health") == "heartbeat-recent":
        worker_tools = {x["engine"] for x in heartbeat.get("engines", []) if x.get("installed") is True}
        for item in items:
            if item["id"] in worker_tools:
                item["installed"] = True
                item["runnable"] = False  # never allow a worker CLI in synchronous HTTP
                item["status"] = "worker_available"
                item["reason"] = "Executável presente no Daemon recente; utilize a fila autenticada. Consulta não testada."
    return {"engines": items, "execution_policy": "authenticated-opt-in",
            "workers_health": heartbeat.get("workers_health", "unverified"),
            "notice": "Presença recente de worker não comprova sucesso das consultas externas."}


@app.post("/api/v1/engines/run")
def engine_run(payload: EngineRequest, authorization: str | None = Header(default=None)):
    """Disabled by default; requires server-side flag, secret and explicit action."""
    if os.getenv("OSINT_ENGINE_EXECUTION_ENABLED") != "1":
        raise HTTPException(503, "Execução remota desabilitada. Nenhum motor foi consultado.")
    secret = os.getenv("OSINT_ENGINE_TOKEN", "")
    if len(secret) < 32:
        raise HTTPException(503, "Execução não configurada pelo administrador.")
    token = (authorization or "").removeprefix("Bearer ")
    if not authorization or not authorization.startswith("Bearer ") or not hmac.compare_digest(token, secret):
        raise HTTPException(401, "Credencial de execução inválida.")
    try:
        return execute_engine(payload.engine, payload.value)
    except EngineError as exc:
        raise HTTPException(422, str(exc)) from exc



@app.post("/api/v1/engines/jobs")
async def create_engine_job(payload: EngineRequest, authorization: str | None = Header(default=None)):
    """Private operator only. Requires explicitly enabled durable infrastructure."""
    if os.getenv("OSINT_ENGINE_QUEUE_ENABLED") != "1":
        raise HTTPException(503, "Fila de motores não está implantada neste ambiente.")
    secret = os.getenv("OSINT_ENGINE_TOKEN", "")
    if len(secret) < 32:
        raise HTTPException(503, "Autenticação administrativa não configurada.")
    received = (authorization or "").removeprefix("Bearer ")
    if not authorization or not authorization.startswith("Bearer ") or not hmac.compare_digest(received, secret):
        raise HTTPException(401, "Credencial inválida.")
    try:
        return await queue_submit(payload.engine, payload.value, authenticated=True)
    except EngineError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, "Fila indisponível. Nenhum processamento confirmado.") from exc


@app.get("/api/v1/engines/jobs/{job_id}")
async def get_engine_job(job_id: str, authorization: str | None = Header(default=None)):
    """Read result from PRIVATE Blob only for the operator with the server token."""
    if os.getenv("OSINT_ENGINE_QUEUE_ENABLED") != "1":
        raise HTTPException(503, "Fila de motores desativada.")
    secret = os.getenv("OSINT_ENGINE_TOKEN", "")
    if len(secret) < 32:
        raise HTTPException(503, "Autenticação administrativa não configurada.")
    received = (authorization or "").removeprefix("Bearer ")
    if not authorization or not authorization.startswith("Bearer ") or not hmac.compare_digest(received, secret):
        raise HTTPException(401, "Credencial inválida.")
    if not JOB_UUID_RE.fullmatch(job_id):
        raise HTTPException(422, "ID de tarefa inválido.")
    try:
        from vercel.blob import get_blob, BlobNotFoundError
        try:
            blob = await get_blob(f"osint-jobs/{job_id}/result.json", access="private")
        except BlobNotFoundError:
            return {"job_id": job_id, "status": "pending", "notice": "Tarefa ainda não concluiu ou expirou."}
    except Exception as exc:
        raise HTTPException(503, "Armazenamento privado indisponível.") from exc
    import json
    return json.loads(blob.body)



@app.get("/api/v1/system/readiness")
async def operational_readiness():
    """Read-only deployment doctor; no tokens or secret values in responses."""
    enabled = os.environ.get("OSINT_ENGINE_QUEUE_ENABLED") == "1"
    credential_ok = len(os.environ.get("OSINT_ENGINE_TOKEN", "")) >= 32
    blob_detected = bool(
        os.environ.get("BLOB_READ_WRITE_TOKEN") or
        os.environ.get("VERCEL_BLOB_READ_WRITE_TOKEN") or
        os.environ.get("BLOB_STORE_ID")
    )
    worker = await engine_queue_capabilities()
    live = worker.get("workers_health") == "heartbeat-recent"
    return {
        "version": VERSION,
        "queue": {"configured": enabled, "tested": False, "region": "gru1"},
        "operator_auth": {"configured": credential_ok, "method": "admin-token-temporary"},
        "private_blob": {"binding_detected": blob_detected, "tested": False},
        "daemon": {"recent_heartbeat": live, "tested_job": False},
        "can_submit_jobs": enabled and credential_ok and blob_detected and live,
        "notice": "Variáveis e heartbeat não comprovam consultas externas operacionais."
    }


@app.get("/api/v1/engines/queue/capabilities")
async def engine_queue_capabilities():
    """Only a recent PRIVATE Blob heartbeat proves a worker has checked in."""
    configured = os.getenv("OSINT_ENGINE_QUEUE_ENABLED") == "1"
    result = {"configured": configured, "workers_health": "unverified",
              "admin_auth_required": True, "storage": "private-blob",
              "notice": "Instalação não prova execução; verifique heartbeat do daemon."}
    if not configured:
        return result
    try:
        from vercel.blob import get_blob
        from datetime import datetime, timezone
        import json
        item = await get_blob("osint-health/worker.json", access="private")
        data = json.loads(item.body)
        observed = datetime.fromisoformat(data["observed_at"])
        seconds = (datetime.now(timezone.utc) - observed).total_seconds()
        if 0 <= seconds <= 180:
            result["workers_health"] = "heartbeat-recent"
            result["last_seen_utc"] = observed.isoformat()
            result["engines"] = [
                {"engine": str(x.get("engine", ""))[:32], "installed": x.get("installed") is True}
                for x in data.get("engines", [])[:5]
            ]
    except Exception:
        pass  # A failed health probe never asserts that engines are ready.
    return result


@app.get("/api/v1/integrations")
def integrations():
    return {"integrations": [
        {"name": "Catálogo de fontes", "status": "active", "detail": f"{len(SOURCES)} destinos para pesquisa manual"},
        {"name": "DNS-over-HTTPS", "status": "experimental", "detail": "Consultas opcionais A/MX/NS a Cloudflare"},
        {"name": "Certificados CT", "status": "experimental", "detail": "Consulta opcional a crt.sh"},
        {"name": "GitHub público", "status": "experimental", "detail": "Consulta opcional de perfis públicos via REST"},
        {"name": "Laboratório de imagens", "status": "active", "detail": "SHA-256/dHash, comparação entre casos e OCR no navegador sob demanda"},
        {"name": "Busca reversa na web", "status": "planned", "detail": "Google Cloud Vision: provedor opcional, requer chave/cota/consentimento; ver /api/v1/images/reverse/config"},
        {"name": "Sherlock / Maigret", "status": "experimental", "detail": "Pacotes Python fixados por versão; execução exige autorização e validação real."},
        {"name": "SpiderFoot / subfinder / Amass", "status": "planned", "detail": "Contêiner preparado, mas worker e orquestração ainda não implantados."},
        {"name": "Casos, grafo e evidências", "status": "planned", "detail": "Exigem autenticação e banco por usuário para acesso público"},
        {"name": "MCP remoto", "status": "experimental", "detail": "Cliente browser HTTPS+CORS e servidor oficial MCP v2 de leitura, sem casos ou execução de motores"},
        {"name": "Workers OSINT Vercel", "status": "planned", "detail": "Runtime de cinco motores e fila codificados; deployment Daemon/Private Blob ainda não ativado"},
    ]}


# MCP mount must be last: preserve all existing FastAPI paths and only expose read-only tools.
app.mount("/mcp", mcp_server_app())
