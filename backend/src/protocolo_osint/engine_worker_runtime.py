"""Opt-in container worker for the five separately licensed upstream OSINT CLIs.

The worker is not exposed as a public HTTP endpoint. Inputs are restricted to one
public DNS name or one username. Network searches require explicit authorization.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from .engine_hub import EngineError, ENGINES, _validate

MAX_SECONDS = {"sherlock": 70, "maigret": 90, "subfinder": 65, "amass": 200, "spiderfoot": 220}
MAX_STDOUT = 30000
MAX_STDERR = 2000
MAX_RESULTS = 120


def worker_command(engine_id: str, value: str, which=shutil.which,
                   spiderfoot_script: tuple[str, str] | None = None) -> list[str]:
    """Build a passive-only command with fixed flags, never shell interpolation.

    The optional script entrypoint supports the official SpiderFoot checkout
    installed in a separate local Python environment. The Vercel worker retains
    its original command and packaged binary.
    """
    spec = next((x for x in ENGINES if x.id == engine_id), None)
    if spec is None:
        raise EngineError("Motor não reconhecido.")
    target = _validate(spec, value)
    binary = which(spec.executable)
    if engine_id == "spiderfoot" and spiderfoot_script is not None:
        python, script = spiderfoot_script
        prefix = [python, script]
    elif binary is not None:
        prefix = [binary]
    else:
        raise EngineError(f"{spec.title} não instalado neste ambiente.")
    binary = prefix[0]
    if engine_id == "sherlock":
        return [binary, "--print-found", "--no-color", "--timeout", "5", "--site", "GitHub", "--site", "GitLab", "--site", "Reddit", target]
    if engine_id == "maigret":
        return [binary, target, "--no-recursion", "--no-autoupdate", "--top-sites", "20", "--timeout", "5", "--max-connections", "4"]
    if engine_id == "subfinder":
        return [binary, "-d", target, "-silent", "-timeout", "5", "-max-time", "1", "-max-results", "40"]
    if engine_id == "amass":
        return [binary, "enum", "-passive", "-d", target, "-timeout", "3", "-nocolor", "-silent"]
    if engine_id == "spiderfoot":
        # Stable SpiderFoot CLI supports a passive-only module set and JSON output.
        return [*prefix, "-s", target, "-u", "passive", "-o", "json", "-max-threads", "2", "-q"]
    raise EngineError("Motor não implementado.")


def run_bounded_engine(engine_id: str, value: str, *, runner: Callable = subprocess.run,
                       which=shutil.which,
                       spiderfoot_script: tuple[str, str] | None = None) -> dict:
    """Shared sandbox runner. Callers MUST enforce their own trust boundary.

    Hosted Daemons require OSINT_WORKER_AUTHORIZED; the local API separately
    requires loopback + OSINT_ENABLE_LOCAL_ENGINES. Never call from public HTTP.
    """
    cmd = worker_command(engine_id, value, which=which,
                         spiderfoot_script=spiderfoot_script)
    with tempfile.TemporaryDirectory(prefix="protocolo-engine-") as temp:
        try:
            result = runner(
                cmd, cwd=temp, shell=False, capture_output=True, text=True,
                stdin=subprocess.DEVNULL, timeout=MAX_SECONDS[engine_id], check=False,
                env={"HOME": temp, "TMPDIR": temp, "PATH": os.getenv("PATH", ""),
                     "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1", "NO_COLOR": "1"},
            )
        except subprocess.TimeoutExpired as exc:
            raise EngineError("Motor excedeu o tempo limite do worker.") from exc
        except (OSError, subprocess.SubprocessError) as exc:
            raise EngineError("Falha ao inicializar motor no worker.") from exc
    raw = str(result.stdout or "")
    lines = []
    seen = set()
    for line in raw.splitlines():
        line = line.strip()
        if not line or len(line) > 400 or line in seen:
            continue
        seen.add(line)
        lines.append(line)
        if len(lines) >= MAX_RESULTS:
            break
    return {
        "engine": engine_id, "status": "completed" if result.returncode == 0 else "failed",
        "exit_code": int(result.returncode), "records": lines,
        "stdout_excerpt": raw[:MAX_STDOUT],
        "stderr_excerpt": str(result.stderr or "")[:MAX_STDERR],
        "truncated": len(raw) > MAX_STDOUT,
        "source": next(x.source for x in ENGINES if x.id == engine_id),
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "warning": "Saída bruta do motor. Não confirma identidade ou titularidade; verifique fontes independentemente.",
    }


def run_worker_engine(engine_id: str, value: str, *, runner: Callable = subprocess.run,
                      which=shutil.which) -> dict:
    """Hosted Daemon security gate preserved: no CLI without operator opt-in."""
    if os.getenv("OSINT_WORKER_AUTHORIZED") != "1":
        raise EngineError("Worker não autorizado para executar consultas.")
    return run_bounded_engine(engine_id, value, runner=runner, which=which)


def inventory(which=shutil.which):
    """Worker-side presence probes; never claims web-source availability."""
    return [{"engine": e.id, "installed": bool(which(e.executable)), "mode": "worker", "version_requested": e.project_version} for e in ENGINES]
