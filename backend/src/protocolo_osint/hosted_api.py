"""Safe public Vercel surface. No local SQLite or multi-user endpoints here.

This module is intentionally separate from main.py, the full local application.
"""
from __future__ import annotations

import hmac
import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .catalog import SOURCES, list_sources, plan
from .detection import detect_type
from .live_lookup import PROVIDERS, LookupError, lookup
from .engine_hub import EngineError, execute as execute_engine, inventory as engine_inventory
from .image_routes import router as image_router

VERSION = "0.6.0"
ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "public"

app = FastAPI(title="Protocolo OSINT V2 — API pública", version=VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")
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
        "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; connect-src 'self' https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; worker-src 'self' blob:; object-src 'none'; "
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
def engine_status():
    """Read-only runtime detection; does not trigger third-party requests."""
    return {"engines": engine_inventory(), "execution_policy": "authenticated-opt-in",
            "notice": "Instalação não equivale a execução validada; motores longos precisam de worker."}


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
        {"name": "MCP remoto", "status": "planned", "detail": "Acesso remoto requer autenticação e autorização explícitas"},
    ]}
