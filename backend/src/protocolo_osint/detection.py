"""Conservative, offline classification of voluntarily supplied search terms.

Classifying a value never queries a network or enriches personal data.
"""
from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlsplit

EMAIL = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$")
DOMAIN = re.compile(r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$")
USERNAME = re.compile(r"^@?[A-Za-z0-9_.-]{2,50}$")


def detect_type(raw: str) -> str:
    value = raw.strip()
    if not value or len(value) > 512 or any(ord(c) < 32 for c in value):
        raise ValueError("Informe um termo de 1 a 512 caracteres, sem caracteres de controle.")
    try:
        ipaddress.ip_address(value)
        return "ip"
    except ValueError:
        pass
    if EMAIL.fullmatch(value):
        return "email"
    try:
        parsed = urlsplit(value)
        if parsed.scheme in {"http", "https"} and parsed.netloc and parsed.hostname:
            return "url"
    except ValueError:
        # Malformed URLs are untrusted input, not server errors.
        pass
    if DOMAIN.fullmatch(value):
        return "domain"
    if USERNAME.fullmatch(value):
        return "username_candidate"
    return "free_text"
