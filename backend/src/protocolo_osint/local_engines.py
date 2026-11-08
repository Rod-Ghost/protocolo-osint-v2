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
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Any

from .detection import DOMAIN
from .engine_worker_runtime import worker_command, run_bounded_engine

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
    Engine("spiderfoot", "spiderfoot", "https://github.com/smicallef/spiderfoot", "GPL-2.0-only", "domain", "Investigação passiva em CLI; requer instalação isolada no computador"),
)


class EngineError(ValueError):
    pass


def spiderfoot_script() -> tuple[str, str] | None:
    """Official sf.py checkout in its own venv; never execute arbitrary URLs.

    OSINT_SPIDERFOOT_DIR is a *local* filesystem directory configured by
    the workstation operator; it cannot be supplied through the HTTP API.
    """
    root = os.environ.get("OSINT_SPIDERFOOT_DIR", "").strip()
    if not root:
        return None
    directory = Path(root).expanduser()
    python = Path(os.environ.get("OSINT_SPIDERFOOT_PYTHON", sys.executable)).expanduser()
    script = directory / "sf.py"
    if not directory.is_dir() or not script.is_file() or not python.is_file():
        return None
    return str(python.resolve()), str(script.resolve())


def _installed(engine: Engine) -> bool:
    return shutil.which(engine.executable) is not None or (
        engine.id == "spiderfoot" and spiderfoot_script() is not None
    )


def inventory() -> list[dict[str, Any]]:
    """Report real local tool availability in the shared Engine Studio schema."""
    opt_in = os.getenv("OSINT_ENABLE_LOCAL_ENGINES") == "1"
    titles = {"sherlock": "Sherlock", "maigret": "Maigret",
              "subfinder": "subfinder", "amass": "OWASP Amass",
              "spiderfoot": "SpiderFoot"}
    items = []
    for engine in ENGINES:
        installed = _installed(engine)
        runnable = installed and opt_in
        if not installed:
            status, reason = "not_installed", "Instale o executável oficial ou configure o checkout local do SpiderFoot."
        elif not opt_in:
            status, reason = "approval_required", "Ative OSINT_ENABLE_LOCAL_ENGINES=1 apenas no próprio computador."
        else:
            status, reason = "ready", "Motor local disponível, sem OAuth, token nem conta."
        items.append({
            "id": engine.id, "title": titles[engine.id],
            "project": engine.project, "source": engine.project,
            "license": engine.license, "accepts": engine.accepts,
            "input_kind": engine.accepts, "mode": "local",
            "description": engine.description,
            "installed": installed, "enabled": opt_in,
            "runnable": runnable, "status": status, "reason": reason,
        })
    return items


def validate_local_job(engine_id: str, query: str) -> None:
    """Reject disabled, malformed or uninstalled jobs before enqueueing."""
    if os.getenv("OSINT_ENABLE_LOCAL_ENGINES") != "1":
        raise EngineError("Motores locais desativados. Defina OSINT_ENABLE_LOCAL_ENGINES=1 no computador.")
    script = spiderfoot_script() if engine_id == "spiderfoot" else None
    worker_command(engine_id, query, which=shutil.which, spiderfoot_script=script)


def run_local_job(engine_id: str, query: str, *, runner=subprocess.run) -> dict[str, Any]:
    """Use the same bounded passive CLI runner as the private Daemon.

    Validation is repeated on execution, not only when queued.
    """
    validate_local_job(engine_id, query)
    script = spiderfoot_script() if engine_id == "spiderfoot" else None
    return run_bounded_engine(engine_id, query, runner=runner,
                              which=shutil.which, spiderfoot_script=script)


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
    if engine_id == "spiderfoot":
        raise EngineError("SpiderFoot utiliza a fila local de tarefas; consulte /api/v1/local-engines/jobs.")
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
