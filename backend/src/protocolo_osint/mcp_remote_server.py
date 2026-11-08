"""Public *read-only* MCP server using the official 2026-07-28 Python SDK.

No OSINT motors, credentials, cases, or private blobs are exposed to MCP.
The server reads only static source metadata and plans searches; it does not
visit URLs or attest identity. Stateful features require scoped OAuth in future.
"""
from __future__ import annotations

import os
from urllib.parse import urlparse
from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

from .catalog import SOURCES, list_sources, plan
from .detection import detect_type

mcp = MCPServer("Protocolo OSINT V2", version="0.8.0", subscriptions=False)


@mcp.tool()
def osint_classify(value: str) -> dict:
    """Classifica um termo OSINT sem fazer consultas externas ou armazená-lo."""
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 512:
        raise ValueError("Informe entre 1 e 512 caracteres.")
    kind = detect_type(value)
    return {"kind": kind, "value": value.strip(), "external_requests": 0, "verified": False}


@mcp.tool()
def osint_plan_sources(value: str, category: str = "") -> dict:
    """Prepara URLs de fontes públicas, mas NÃO visita destinos nem comprova resultados."""
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 512:
        raise ValueError("Termo fora do limite.")
    if not isinstance(category, str) or len(category) > 80:
        raise ValueError("Categoria inválida.")
    kind = detect_type(value)
    records = plan(value, kind, category or None)[:45]
    return {"kind": kind, "results": records, "count": len(records),
            "external_requests": 0, "verified": False,
            "notice": "URLs planejadas; nenhum site foi consultado automaticamente."}


@mcp.tool()
def osint_list_sources(query: str = "") -> dict:
    """Lista fontes documentadas no catálogo. Não executa nenhuma fonte."""
    if not isinstance(query, str) or len(query) > 80:
        raise ValueError("Filtro muito longo.")
    records = list_sources(q=query or None)
    return {"sources": records[:50], "total": len(records), "external_requests": 0,
            "verified": False}


def configured_hosts() -> list[str]:
    """Explicit production hosts and this deployment's auto-generated Vercel host."""
    hosts = ["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*",
             "protocolo-osint-v2-nine.vercel.app", "protocolo-osint-v2.vercel.app"]
    for raw in (os.getenv("VERCEL_URL", ""), os.getenv("MCP_PUBLIC_HOST", "")):
        value = raw.strip().lower()
        if value and "/" not in value and ":" not in value and value.endswith(".vercel.app"):
            hosts.append(value)
    return sorted(set(hosts))


def server_app():
    """Return ASGI app; host FastAPI must enter session_manager.run() in lifespan."""
    security = TransportSecuritySettings(
        allowed_hosts=configured_hosts(),
        allowed_origins=["https://protocolo-osint-v2-nine.vercel.app", "https://protocolo-osint-v2.vercel.app"],
    )
    return mcp.streamable_http_app(streamable_http_path="/", stateless_http=True,
                                   json_response=True, transport_security=security,
                                   max_request_body_size=8192)
