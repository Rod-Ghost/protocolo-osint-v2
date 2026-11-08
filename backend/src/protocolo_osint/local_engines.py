"""Optional, local-only adapters for established open-source OSINT CLIs.

This module does NOT vendor third-party projects. Operators install and license
providers separately. Never import this module from the public Vercel API.

Execution must be explicitly enabled, runs without shell, constrains arguments,
uses a deadline, limits output and emits no automatic bulk lookups.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any

from .detection import DOMAIN

USERNAME = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{1,49}$")


@dataclass(frozen=True)
class Engine:
    id: str
    executable: str
    project: str
    license: str
    accepts: str
    description: str


ENGINES = (
    Engine("sherlock", "sherlock", "https://github.com/sherlock-project/sherlock", "MIT", "username", "Busca usernames em sites públicos"),
    Engine("maigret", "maigret", "https://github.com/soxoj/maigret", "MIT", "username", "Análise de usernames públicos"),
    Engine("subfinder", "subfinder", "https://github.com/projectdiscovery/subfinder", "MIT", "domain", "Enumeração passiva de subdomínios"),
    Engine("amass", "amass", "https://github.com/owasp-amass/amass", "Apache-2.0*", "domain", "Enumeração passiva de DNS"),
    Engine("spiderfoot", "spiderfoot", "https://github.com/smicallef/spiderfoot", "MIT", "service", "Plataforma extensível isolada, integração via processo ou serviço dedicado"),
)


class EngineError(ValueError):
    pass


def inventory() -> list[dict[str, Any]]:
    return [
        {"id": engine.id, "project": engine.project, "license": engine.license,
         "accepts": engine.accepts, "description": engine.description,
         "installed": shutil.which(engine.executable) is not None,
         "enabled": os.getenv("OSINT_ENABLE_LOCAL_ENGINES") == "1" and engine.accepts != "service"}
        for engine in ENGINES
    ]


def _command(engine: Engine, query: str) -> list[str]:
    query = query.strip().lstrip("@")
    if engine.accepts == "domain":
        if not DOMAIN.fullmatch(query):
            raise EngineError("O motor aceita somente um domínio válido.")
    elif engine.accepts == "username":
        if not USERNAME.fullmatch(query):
            raise EngineError("O motor aceita somente um username válido.")
    else:
        raise EngineError("Integração com serviço dedicado ainda não configurada.")
    return {
        "sherlock": [engine.executable, "--print-found", "--timeout", "7", query],
        "maigret": [engine.executable, query, "--no-recursion", "--top-sites", "100"],
        "subfinder": [engine.executable, "-silent", "-d", query],
        "amass": [engine.executable, "enum", "-passive", "-d", query],
    }[engine.id]


def run(engine_id: str, query: str, *, runner=subprocess.run) -> dict[str, Any]:
    """A single explicit local invocation; NEVER call this from hosted endpoints."""
    if os.getenv("OSINT_ENABLE_LOCAL_ENGINES") != "1":
        raise EngineError("Motores locais desabilitados por padrão. Defina OSINT_ENABLE_LOCAL_ENGINES=1 no ambiente confiável.")
    engine = next((eng for eng in ENGINES if eng.id == engine_id), None)
    if engine is None:
        raise EngineError("Motor não reconhecido.")
    if not shutil.which(engine.executable):
        raise EngineError(f"Motor {engine.id} não instalado neste ambiente.")
    command = _command(engine, query)
    try:
        completed = runner(command, shell=False, capture_output=True, text=True,
                           timeout=45, check=False)
    except subprocess.TimeoutExpired as exc:
        raise EngineError("Motor excedeu o prazo máximo configurado.") from exc
    return {"engine": engine.id, "query": query, "returncode": completed.returncode,
            "stdout": (completed.stdout or "")[:12000], "stderr": (completed.stderr or "")[:2000],
            "truncated": len(completed.stdout or "") > 12000,
            "notice": "Resultado bruto de serviço externo, sujeito a falsos positivos. Verifique cada fonte."}
