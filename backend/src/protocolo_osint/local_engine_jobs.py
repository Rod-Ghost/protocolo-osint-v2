"""In-memory bounded OSINT job queue for the *local workstation only*.

No OAuth, cloud storage or Vercel token. Public hosted_api MUST NOT mount this.
One subprocess at a time, two additional jobs permitted, one-hour in-memory
retention. All file/network side effects belong to the opted-in upstream CLIs.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import threading
import time
import uuid
from typing import Callable

from .engine_hub import EngineError
from .local_engines import run_local_job, validate_local_job

MAX_ACTIVE_JOBS = 3
MAX_STORED_JOBS = 12
RESULT_TTL_SECONDS = 3600


class LocalQueueFull(EngineError):
    """Limit reached before a CLI process was started."""


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


class LocalEngineJobManager:
    """Single-operator, memory-only execution queue; no persistent history."""

    def __init__(self, runner: Callable = run_local_job):
        self._runner = runner
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="osint-local")
        self._lock = threading.RLock()
        self._jobs: dict[str, dict] = {}

    def _prune(self) -> None:
        """Called only under lock; never discard running or queued work."""
        now = time.monotonic()
        removable = sorted(
            (x for x in self._jobs.values() if x["status"] not in {"queued", "running"}),
            key=lambda x: x["_created"],
        )
        for job in removable:
            if now - job.get("_finished", now) > RESULT_TTL_SECONDS or len(self._jobs) > MAX_STORED_JOBS:
                self._jobs.pop(job["job_id"], None)

    def submit(self, engine: str, target: str) -> dict:
        # A failed validation never enqueues a task.
        validate_local_job(engine, target)
        with self._lock:
            self._prune()
            active = sum(x["status"] in {"queued", "running"} for x in self._jobs.values())
            if active >= MAX_ACTIVE_JOBS:
                raise LocalQueueFull("Fila local cheia: conclua as três tarefas existentes antes de enviar outra.")
            job_id = uuid.uuid4().hex
            self._jobs[job_id] = {
                "job_id": job_id, "engine": engine, "target": target,
                "status": "queued", "created_at": _utc(), "_created": time.monotonic(),
                "result": None, "error": None,
            }
            self._pool.submit(self._execute, job_id, engine, target)
            return self._public(self._jobs[job_id])

    def _execute(self, job_id: str, engine: str, target: str) -> None:
        with self._lock:
            self._jobs[job_id]["status"] = "running"
            self._jobs[job_id]["started_at"] = _utc()
        try:
            output = self._runner(engine, target)
            status = "completed" if output.get("status", "completed") == "completed" else "failed"
            error = None
        except EngineError as exc:
            output, status, error = None, "failed", str(exc)[:250]
        except Exception:
            # Never expose a traceback, environment or subprocess stderr in HTTP.
            output, status, error = None, "failed", "Falha ao processar motor local."
        with self._lock:
            job = self._jobs[job_id]
            job.update(status=status, finished_at=_utc(), result=output,
                       error=error, _finished=time.monotonic())
            self._prune()

    @staticmethod
    def _public(job: dict) -> dict:
        return {key: value for key, value in job.items() if not key.startswith("_")}

    def get(self, job_id: str) -> dict | None:
        if len(job_id) != 32 or any(c not in "0123456789abcdef" for c in job_id):
            return None
        with self._lock:
            self._prune()
            found = self._jobs.get(job_id)
            return self._public(found) if found is not None else None

    def close(self) -> None:
        """For test teardown or orderly local server shutdown."""
        self._pool.shutdown(wait=True)


_manager: LocalEngineJobManager | None = None
_manager_lock = threading.Lock()


def get_manager() -> LocalEngineJobManager:
    global _manager
    with _manager_lock:
        if _manager is None:
            _manager = LocalEngineJobManager()
        return _manager
