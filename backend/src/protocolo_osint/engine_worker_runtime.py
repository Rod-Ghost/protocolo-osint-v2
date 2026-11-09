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
from .target_routing import validate_target, SPIDERFOOT_KINDS

MAX_SECONDS = {"sherlock": 70, "maigret": 90, "subfinder": 65, "amass": 200, "spiderfoot": 220}
MAX_STDOUT = 30000
MAX_STDERR = 2000
MAX_RESULTS = 120


def worker_command(engine_id: str, value: str, which=shutil.which, *, target_kind: str | None = None) -> list[str]:
    """Build a passive-only command with fixed flags, never shell interpolation."""
    spec = next((x for x in ENGINES if x.id == engine_id), None)
    if spec is None:
        raise EngineError("Motor não reconhecido.")
    if engine_id == "spiderfoot" and target_kind is not None:
        resolved = validate_target(value, target_kind)
        if resolved.engine_kind not in SPIDERFOOT_KINDS:
            raise EngineError("Tipo de alvo incompatível com SpiderFoot.")
        target = resolved.normalized
        target_kind = resolved.engine_kind
    else:
        if target_kind is not None:
            raise EngineError("Tipo de alvo extra disponível apenas para SpiderFoot.")
        target = _validate(spec, value)
    binary = which(spec.executable)
    if binary is None:
        raise EngineError(f"{spec.title} não instalado neste worker.")
    if engine_id == "sherlock":
        return [binary, "--print-found", "--no-color", "--timeout", "5", "--site", "GitHub", "--site", "GitLab", "--site", "Reddit", target]
    if engine_id == "maigret":
        return [binary, target, "--no-recursion", "--no-autoupdate", "--top-sites", "20", "--timeout", "5", "--max-connections", "4"]
    if engine_id == "subfinder":
        # subfinder v2.9.0 supports rate limiting, but has no -max-results flag.
        return [binary, "-d", target, "-silent", "-timeout", "5", "-max-time", "1", "-rl", "5"]
    if engine_id == "amass":
        return [binary, "enum", "-passive", "-d", target, "-timeout", "3", "-nocolor", "-silent"]
    if engine_id == "spiderfoot":
        # Stable SpiderFoot CLI supports a passive-only module set and JSON output.
        # Dotted usernames need explicit quotes to avoid INTERNET_NAME.
        # sf.py itself wraps names with spaces; double-quoting would be wrong.
        # Our pinned Vercel installation patches v4.0 to preserve ASN/IPv6/BTC
        # type detection before its username fallback.
        seed = '"' + target + '"' if target_kind == "username" else target
        return [binary, "-s", seed, "-u", "passive", "-o", "json", "-max-threads", "2", "-q"]
    raise EngineError("Motor não implementado.")


def run_worker_engine(engine_id: str, value: str, *, runner: Callable = subprocess.run, which=shutil.which, target_kind: str | None = None) -> dict:
    """Run only a named CLI, in a temporary home, bounded by hard time limits."""
    if os.getenv("OSINT_WORKER_AUTHORIZED") != "1":
        raise EngineError("Worker não autorizado para executar consultas.")
    cmd = worker_command(engine_id, value, which=which, target_kind=target_kind)
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


def inventory(which=shutil.which):
    """Worker-side presence probes; never claims web-source availability."""
    return [{"engine": e.id, "installed": bool(which(e.executable)), "mode": "worker", "version_requested": e.project_version} for e in ENGINES]
