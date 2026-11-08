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
    """Report actual local CLI readiness using the same UI contract as Vercel.

    Local execution never requires an administrator token. Engines remain
    opt-in and must be installed on the operator's own computer.
    """
    opt_in = os.getenv("OSINT_ENABLE_LOCAL_ENGINES") == "1"
    items = []
    titles = {"sherlock": "Sherlock", "maigret": "Maigret",
              "subfinder": "subfinder", "amass": "OWASP Amass",
              "spiderfoot": "SpiderFoot"}
    for engine in ENGINES:
        installed = shutil.which(engine.executable) is not None
        supported = engine.accepts != "service"
        runnable = installed and opt_in and supported
        if not installed:
            status, reason = "not_installed", "Instale o executável no computador para utilizá-lo."
        elif not supported:
            status, reason = "worker_required", "Integração local por serviço ainda não implementada."
        elif not opt_in:
            status, reason = "approval_required", "Ative OSINT_ENABLE_LOCAL_ENGINES=1 somente no ambiente local."
        else:
            status, reason = "ready", "Disponível neste computador, sem token ou login."
        items.append({
            "id": engine.id, "title": titles[engine.id],
            "project": engine.project, "source": engine.project,
            "license": engine.license, "accepts": engine.accepts,
            "input_kind": engine.accepts if supported else "domain",
            "mode": "local" if supported else "worker",
            "description": engine.description,
            "installed": installed, "enabled": opt_in and supported,
            "runnable": runnable, "status": status, "reason": reason,
        })
    return items


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
