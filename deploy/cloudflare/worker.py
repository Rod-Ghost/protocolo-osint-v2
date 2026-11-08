"""Protocolo OSINT V2: public, stateless Python Worker API.

Does not expose local SQLite, case management, uploaded images or MCP tools.
Reuses the canonical catalog/detection modules from backend when deployed.
"""
from __future__ import annotations

import json
from urllib.parse import parse_qs, urlsplit

from workers import WorkerEntrypoint, Response
from catalog import SOURCES, list_sources, plan
from detection import detect_type

VERSION = "0.2.1-public-preview"
ALLOWED_ORIGIN = "https://rod-ghost.github.io"


def response(payload: object, origin: str = "", status: int = 200):
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
    }
    if origin == ALLOWED_ORIGIN:
        headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN
        headers["Vary"] = "Origin"
    return Response(json.dumps(payload, ensure_ascii=False), status=status, headers=headers)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        method = str(request.method).upper()
        full_url = urlsplit(str(request.url))
        path = full_url.path
        origin = str(request.headers.get("origin") or "")

        if method == "OPTIONS":
            if origin != ALLOWED_ORIGIN:
                return response({"detail": "Origem não permitida."}, origin, 403)
            return Response("", status=204, headers={
                "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Max-Age": "600",
                "Vary": "Origin",
            })

        if method == "GET" and path in ("/", "/api/v1/health"):
            return response({"status": "ok", "version": VERSION,
                             "runtime": "Cloudflare Python Workers",
                             "privacy": "stateless", "external_requests": 0}, origin)

        if method == "GET" and path == "/api/v1/summary":
            return response({"sources": len(SOURCES),
                             "categories": len({s.category for s in SOURCES}),
                             "cases": 0, "evidence": 0, "online_integrations": 0,
                             "mode": "public-readonly"}, origin)

        if method == "GET" and path == "/api/v1/sources":
            params = parse_qs(full_url.query)
            def get(name):
                return (params.get(name) or [None])[0]
            items = list_sources(get("kind"), get("category"), get("q"))
            return response({"sources": items, "total": len(SOURCES),
                             "validation": "Destinos externos não verificados individualmente."}, origin)

        if method == "GET" and path == "/api/v1/integrations":
            return response({"integrations": [
                {"name": "Fontes OSINT", "status": "active", "detail": "41 fontes públicas catalogadas; sem consulta automática"},
                {"name": "Busca preparada", "status": "active", "detail": "Links gerados localmente; sem requisição externa"},
                {"name": "Análise de imagens", "status": "browser-only", "detail": "Hashes locais no navegador, sem upload"},
                {"name": "Casos e evidências", "status": "disabled", "detail": "Exige login e armazenamento protegido"},
                {"name": "MCP e conectores avançados", "status": "planned", "detail": "Não expostos na API pública"},
            ]}, origin)

        if method == "POST" and path in ("/api/v1/detect", "/api/v1/search/plan"):
            try:
                body = str(await request.text())
                if len(body) > 4096:
                    return response({"detail": "Payload grande demais."}, origin, 413)
                payload = json.loads(body)
                if not isinstance(payload, dict) or not isinstance(payload.get("value"), str):
                    raise ValueError("Informe 'value' como texto.")
                value = payload["value"].strip()
                kind = detect_type(value)
                if path == "/api/v1/detect":
                    return response({"kind": kind, "value": value, "external_requests": 0}, origin)
                category = payload.get("category")
                if category is not None and (not isinstance(category, str) or len(category) > 80):
                    raise ValueError("Categoria inválida.")
                results = plan(value, kind, category)
                return response({"query": value, "kind": kind, "results": results,
                                 "total": len(results), "external_requests": 0,
                                 "notice": "Links preparados localmente; nenhum serviço externo foi consultado."}, origin)
            except (ValueError, TypeError) as exc:
                return response({"detail": str(exc)}, origin, 422)
            except Exception:
                return response({"detail": "Requisição inválida."}, origin, 400)

        if path.startswith("/api/v1/cases") or path.startswith("/api/v1/images"):
            return response({"detail": "Recurso privado indisponível no serviço público. Use modo local até implementar autenticação."}, origin, 501)

        return response({"detail": "Rota não encontrada."}, origin, 404)