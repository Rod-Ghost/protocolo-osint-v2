"""Conservative, typed routing of one OSINT target to compatible CLI engines.

Classification is offline, does not perform lookups, and never constructs
arbitrary flags or shell strings. Explicit type always overrides a heuristic.
"""
from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from .detection import DOMAIN, EMAIL
from .engine_hub import EngineError, USERNAME

TARGET_KINDS = (
    "auto", "username", "domain", "url", "email", "ip",
    "cidr", "asn", "phone", "name", "bitcoin",
)
SPIDERFOOT_KINDS = frozenset(TARGET_KINDS) - {"auto", "url"}
DOMAIN_SUFFIXES = frozenset((
    "com", "org", "net", "br", "io", "edu", "gov", "mil", "int", "co", "uk",
    "us", "ca", "de", "fr", "es", "it", "pt", "nl", "ch", "au", "jp",
    "in", "cn", "ru", "eu", "me", "ai", "app", "dev", "info", "biz",
    "xyz", "online", "site", "tech", "store", "cloud", "club", "art",
))
PHONE = re.compile(r"^\+[1-9][0-9]{7,14}$")
ASN = re.compile(r"^(?:AS)?([0-9]{1,10})$", re.I)
NAME = re.compile(r"^[^\W\d_][^\W\d_'\- ]*(?:[ '\-][^\W\d_][^\W\d_'\-]*){1,5}$", re.UNICODE)
BTC = re.compile(r"^(?:bc1[ac-hj-np-z02-9]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,35})$", re.I)


@dataclass(frozen=True)
class Target:
    kind: str              # Input type, including URL
    normalized: str        # The only value forwarded to the CLI
    engine_kind: str       # Effective SpiderFoot seed kind


def _public_domain(value: str) -> bool:
    return bool(
        DOMAIN.fullmatch(value)
        and not value.lower().endswith((".local", ".localhost", ".internal", ".test", ".invalid"))
    )


def _is_public_ip(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_global
    except ValueError:
        return False


def choose_kind(value: str) -> str:
    """Best-effort offline detection. Explicit UI types handle all ambiguity."""
    if value.startswith(("https://", "http://")):
        return "url"
    if EMAIL.fullmatch(value):
        return "email"
    if _is_public_ip(value) or (":" in value and "/" not in value):
        return "ip"
    if "/" in value and not value.startswith(("http:", "https:")):
        return "cidr"
    if PHONE.fullmatch(value):
        return "phone"
    if BTC.fullmatch(value):
        return "bitcoin"
    if re.fullmatch(r"AS[0-9]{1,10}", value, re.I):
        return "asn"
    if " " in value:
        return "name"
    if _public_domain(value):
        suffix = value.rsplit(".", 1)[-1].lower()
        # A dotted handle such as rod.roldan is also syntactically a domain.
        # Don't automatically scan it as a domain based on punctuation alone.
        if suffix in DOMAIN_SUFFIXES or value.count(".") >= 2:
            return "domain"
    if USERNAME.fullmatch(value.removeprefix("@")):
        return "username"
    if _public_domain(value):
        return "domain"
    raise EngineError("Formato de alvo desconhecido. Selecione explicitamente Username, Domínio, E-mail, IP ou outro tipo.")


def validate_target(raw: str, requested_kind: str = "auto") -> Target:
    """Validate one public target, including strict limits for network inputs."""
    if not isinstance(raw, str) or not isinstance(requested_kind, str):
        raise EngineError("Tipo de alvo inválido.")
    value = raw.strip()
    if not 2 <= len(value) <= 253 or any(ord(c) < 32 for c in value):
        raise EngineError("Informe um alvo único de 2 a 253 caracteres, sem controles.")
    if requested_kind not in TARGET_KINDS:
        raise EngineError("Tipo de pesquisa não reconhecido.")
    kind = choose_kind(value) if requested_kind == "auto" else requested_kind

    if kind == "username":
        value = value.removeprefix("@")
        if not USERNAME.fullmatch(value):
            raise EngineError("Username público inválido (2 a 39 caracteres, sem espaços).")
    elif kind == "domain":
        value = value.lower().rstrip(".")
        if not _public_domain(value):
            raise EngineError("Informe um domínio público, sem protocolo ou caminho.")
    elif kind == "url":
        try:
            parsed = urlsplit(value)
            hostname = parsed.hostname
            valid = (
                parsed.scheme in ("http", "https")
                and not parsed.username and not parsed.password
                and hostname is not None and parsed.port in (None, 80, 443)
                and _public_domain(hostname)
            )
        except ValueError:
            valid = False
        if not valid:
            raise EngineError("URL inválida: use HTTPS/HTTP com hostname público e sem credenciais.")
        value = hostname.lower()
    elif kind == "email":
        if not EMAIL.fullmatch(value) or len(value) > 253:
            raise EngineError("E-mail inválido.")
    elif kind == "ip":
        try:
            ip = ipaddress.ip_address(value)
            if not ip.is_global:
                raise ValueError("not global")
            value = str(ip)
        except ValueError as exc:
            raise EngineError("Informe um IP global válido; IPs privados e locais não são consultados.") from exc
    elif kind == "cidr":
        try:
            network = ipaddress.ip_network(value, strict=True)
            if network.version != 4 or not network.network_address.is_global or network.num_addresses > 64:
                raise ValueError("out of scope")
            value = str(network)
        except ValueError as exc:
            raise EngineError("Somente redes IPv4 públicas pequenas (até 64 endereços), em CIDR canônico.") from exc
    elif kind == "asn":
        match = ASN.fullmatch(value)
        if not match or not 1 <= int(match.group(1)) <= 4294967295:
            raise EngineError("Informe um ASN numérico válido, por exemplo AS15169.")
        value = str(int(match.group(1)))  # SpiderFoot recognizes numeric BGP_AS_OWNER
    elif kind == "phone":
        if not PHONE.fullmatch(value):
            raise EngineError("Informe telefone no padrão internacional E.164, ex.: +5511999999999.")
    elif kind == "name":
        value = " ".join(value.split())
        if not 3 <= len(value) <= 80 or not NAME.fullmatch(value):
            raise EngineError("Nome inválido. Informe entre duas e seis palavras sem URLs ou símbolos.")
    elif kind == "bitcoin":
        if not BTC.fullmatch(value):
            raise EngineError("Formato de endereço Bitcoin inválido.")
    else:
        raise EngineError("Tipo de pesquisa indisponível.")

    engine_kind = "domain" if kind == "url" else kind
    return Target(kind=kind, normalized=value, engine_kind=engine_kind)


def select_engines(target: Target, requested_engine: str = "auto",
                   include_spiderfoot: bool = True) -> list[str]:
    """Enable only real compatible adapters, never arbitrary third-party flags."""
    compat = {
        "username": ("sherlock", "maigret", "spiderfoot"),
        "domain": ("subfinder", "amass", "spiderfoot"),
        "email": ("spiderfoot",), "ip": ("spiderfoot",),
        "cidr": ("spiderfoot",), "asn": ("spiderfoot",),
        "phone": ("spiderfoot",), "name": ("spiderfoot",),
        "bitcoin": ("spiderfoot",),
    }
    supported = compat[target.engine_kind]
    if requested_engine == "auto":
        selected = [name for name in supported if name != "spiderfoot" or include_spiderfoot]
        return selected or ["spiderfoot"]
    if requested_engine not in supported:
        raise EngineError(
            "Esse motor não aceita esse tipo de alvo. Selecione Automático "
            "ou SpiderFoot para este formato."
        )
    return [requested_engine]
