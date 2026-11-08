"""Bounded, opt-in queries to fixed public OSINT endpoints.

Only public DNS records, certificate transparency records, and GitHub's public
user API are supported. No arbitrary URL fetches, scraping or private IP scans.
No lookup confirms that an online account belongs to a particular person.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

from .detection import DOMAIN

MAX_RESPONSE_BYTES = 260_000
TIMEOUT_SECONDS = 4.0
PROVIDERS = {
    "dns": {"name": "DNS público", "accepts": "domain", "upstream": "Cloudflare DNS-over-HTTPS"},
    "certificates": {"name": "Certificados TLS", "accepts": "domain", "upstream": "crt.sh"},
    "github": {"name": "Perfil público no GitHub", "accepts": "username_candidate", "upstream": "GitHub REST API"},
}


class LookupError(ValueError):
    """Invalid query, upstream failure or response safety cap."""


def _safe_get_json(client: httpx.Client, url: str, params: dict[str, str] | None = None) -> Any:
    # Fixed hosts only. Never follow redirects to user-controlled destinations.
    allowed = {"cloudflare-dns.com", "crt.sh", "api.github.com"}
    parsed = httpx.URL(url)
    if parsed.scheme != "https" or parsed.host not in allowed:
        raise LookupError("Provedor de consulta não autorizado.")
    try:
        with client.stream("GET", url, params=params, timeout=TIMEOUT_SECONDS, follow_redirects=False,
                           headers={"Accept": "application/dns-json" if parsed.host == "cloudflare-dns.com" else "application/json", "User-Agent": "ProtocoloOSINT/0.4 (+public research)"}) as response:
            if response.status_code == 404:
                return None
            if response.status_code != 200:
                raise LookupError(f"Provedor indisponível (HTTP {response.status_code}).")
            raw = bytearray()
            for chunk in response.iter_bytes():
                if len(raw) + len(chunk) > MAX_RESPONSE_BYTES:
                    raise LookupError("Resposta externa excede o limite de segurança.")
                raw.extend(chunk)
            try:
                return httpx.Response(200, content=bytes(raw)).json()
            except ValueError as exc:
                raise LookupError("Provedor retornou dados que não são JSON válido.") from exc
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise LookupError("Provedor externo não respondeu dentro do limite.") from exc


def _valid_username(value: str) -> bool:
    if not (1 <= len(value) <= 39):
        return False
    return (value[0].isalnum() and value[-1].isalnum() and
            all(c.isascii() and (c.isalnum() or c == "-") for c in value))


def lookup(value: str, provider: str, *, client: httpx.Client | None = None) -> dict[str, Any]:
    """Query exactly one allowlisted service, never an arbitrary target URI.

    Client injection is used by tests so upstream network availability is not
    assumed and no real third-party traffic occurs in automated tests.
    """
    value = value.strip()
    if provider not in PROVIDERS:
        raise LookupError("Selecione uma integração disponível.")
    if provider in {"dns", "certificates"} and not DOMAIN.fullmatch(value):
        raise LookupError("Esta consulta exige um domínio público válido.")
    if provider == "github":
        value = value.lstrip("@")
        if not _valid_username(value):
            raise LookupError("Informe um username válido do GitHub (até 39 caracteres).")
    observed_at = datetime.now(timezone.utc).isoformat()
    own_client = client is None
    client = client or httpx.Client(trust_env=False)
    try:
        if provider == "dns":
            # At most three direct requests to a fixed provider. Status 3 = NXDOMAIN.
            records = []
            for record_type in ("A", "MX", "NS"):
                payload = _safe_get_json(
                    client, "https://cloudflare-dns.com/dns-query",
                    params={"name": value, "type": record_type},
                )
                if not isinstance(payload, dict):
                    raise LookupError("Resposta DNS inesperada.")
                for item in payload.get("Answer", [])[:16]:
                    if not isinstance(item, dict):
                        continue
                    data = item.get("data")
                    if isinstance(data, str):
                        records.append({"type": record_type, "name": str(item.get("name", value))[:253], "data": data[:500], "ttl": item.get("TTL", 0) if isinstance(item.get("TTL", 0), int) else 0})
            results = records[:40]
            source_url = "https://cloudflare-dns.com/dns-query"
        elif provider == "certificates":
            payload = _safe_get_json(client, "https://crt.sh/", params={"q": f"%.{value}", "output": "json"})
            if payload is None:
                payload = []
            if not isinstance(payload, list):
                raise LookupError("Formato de resposta CT inesperado.")
            results = []
            seen = set()
            for item in payload:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name_value", ""))[:250]
                if name and name not in seen:
                    seen.add(name)
                    results.append({"name": name, "issuer": str(item.get("issuer_name", ""))[:220],
                                    "not_after": str(item.get("not_after", ""))[:32]})
                if len(results) >= 25:
                    break
            source_url = f"https://crt.sh/?q={quote(value, safe='')}"
        else:
            payload = _safe_get_json(client, f"https://api.github.com/users/{quote(value, safe='')}")
            results = []
            if isinstance(payload, dict):
                results = [{"login": str(payload.get("login", ""))[:80],
                            "profile_url": str(payload.get("html_url", ""))[:250],
                            "public_repos": payload.get("public_repos"),
                            "type": str(payload.get("type", ""))[:50]}]
            source_url = f"https://github.com/{quote(value, safe='')}"
    finally:
        if own_client:
            client.close()
    return {
        "provider": provider,
        "provider_name": PROVIDERS[provider]["name"],
        "query": value,
        "observed_at": observed_at,
        "source_url": source_url,
        "items": results,
        "count": len(results),
        "status": "observed" if results else "no_result",
        "verified": False,
        "notice": "Dados públicos retornados pelo provedor, não confirmação de identidade. Disponibilidade e exatidão podem variar.",
    }
