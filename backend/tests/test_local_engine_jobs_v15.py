"""Local asynchronous CLI jobs: no auth token and no upstream network in tests."""
from __future__ import annotations

import sys
import threading
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from protocolo_osint import local_engines, local_engine_jobs, main
from protocolo_osint.engine_hub import EngineError
from protocolo_osint.engine_worker_runtime import worker_command
from protocolo_osint.local_engine_jobs import LocalEngineJobManager, LocalQueueFull


def _wait_finished(manager: LocalEngineJobManager, job_id: str) -> dict:
    for _ in range(100):
        job = manager.get(job_id)
        if job and job["status"] in {"completed", "failed"}:
            return job
        time.sleep(0.01)
    raise AssertionError("The mocked local job did not complete.")


@pytest.mark.parametrize("engine", ["sherlock", "maigret", "subfinder", "amass", "spiderfoot"])
def test_five_local_jobs_use_the_shared_safe_command(monkeypatch, tmp_path, engine):
    monkeypatch.setenv("OSINT_ENABLE_LOCAL_ENGINES", "1")
    monkeypatch.setattr(local_engines.shutil, "which", lambda name: "/usr/bin/" + name)
    target = "publicuser" if engine in {"sherlock", "maigret"} else "example.org"
    observed = {}

    def fake_runner(command, **kwargs):
        observed.update(command=command, kwargs=kwargs)
        return SimpleNamespace(stdout="found.example.org\n", stderr="", returncode=0)

    result = local_engines.run_local_job(engine, target, runner=fake_runner)
    assert result["engine"] == engine and result["status"] == "completed"
    assert observed["kwargs"]["shell"] is False
    assert observed["kwargs"]["stdin"] is not None
    assert observed["kwargs"]["timeout"] > 0
    assert target in observed["command"]
    assert observed["kwargs"]["env"]["HOME"] != str(tmp_path)
    if engine == "spiderfoot":
        argv = observed["command"]
        assert argv[argv.index("-u") + 1] == "passive"
        assert argv[argv.index("-o") + 1] == "json"
        assert argv[argv.index("-max-threads") + 1] == "2"


def test_spiderfoot_official_checkout_in_separate_python_env(monkeypatch, tmp_path):
    monkeypatch.setenv("OSINT_ENABLE_LOCAL_ENGINES", "1")
    checkout = tmp_path / "spiderfoot checkout"
    checkout.mkdir()
    (checkout / "sf.py").write_text("# official checkout placeholder in test\n")
    monkeypatch.setenv("OSINT_SPIDERFOOT_DIR", str(checkout))
    monkeypatch.setenv("OSINT_SPIDERFOOT_PYTHON", sys.executable)
    monkeypatch.setattr(local_engines.shutil, "which", lambda name: None)
    assert local_engines.spiderfoot_script() is not None
    item = next(x for x in local_engines.inventory() if x["id"] == "spiderfoot")
    assert item["runnable"] is True
    seen = {}

    def runner(cmd, **kwargs):
        seen.update(cmd=cmd, kwargs=kwargs)
        return SimpleNamespace(stdout='{"type":"DOMAIN_NAME"}\n', stderr="", returncode=0)

    assert local_engines.run_local_job("spiderfoot", "example.org", runner=runner)["status"] == "completed"
    assert seen["cmd"][:2] == [str((__import__("pathlib").Path(sys.executable)).resolve()),
                               str((checkout / "sf.py").resolve())]
    assert "-s" in seen["cmd"] and "-u" in seen["cmd"]
    assert seen["kwargs"]["cwd"] != str(checkout)


def test_local_jobs_reject_disabled_invalid_and_uninstalled(monkeypatch):
    monkeypatch.delenv("OSINT_ENABLE_LOCAL_ENGINES", raising=False)
    with pytest.raises(EngineError):
        local_engines.validate_local_job("sherlock", "publicuser")
    monkeypatch.setenv("OSINT_ENABLE_LOCAL_ENGINES", "1")
    monkeypatch.setattr(local_engines.shutil, "which", lambda name: "/usr/bin/" + name)
    with pytest.raises(EngineError):
        local_engines.validate_local_job("spiderfoot", "http://127.0.0.1/")
    with pytest.raises(EngineError):
        local_engines.validate_local_job("sherlock", "a;touch /tmp/hack")
    with pytest.raises(EngineError):
        local_engines.validate_local_job("invalid", "example.org")


def test_job_queue_completion_and_memory_only_result(monkeypatch):
    monkeypatch.setattr(local_engine_jobs, "validate_local_job", lambda *_: None)
    manager = LocalEngineJobManager(runner=lambda engine, target: {
        "engine": engine, "status": "completed", "records": [target], "warning": "test only"
    })
    try:
        created = manager.submit("subfinder", "example.org")
        assert len(created["job_id"]) == 32 and created["status"] in {"queued", "running", "completed"}
        finished = _wait_finished(manager, created["job_id"])
        assert finished["status"] == "completed"
        assert finished["result"]["records"] == ["example.org"]
        assert manager.get("../../etc/passwd") is None
        assert manager.get("e" * 32) is None
    finally:
        manager.close()


def test_job_queue_rejects_over_capacity_and_retains_existing_work(monkeypatch):
    monkeypatch.setattr(local_engine_jobs, "validate_local_job", lambda *_: None)
    entered = threading.Event()
    release = threading.Event()

    def paused_runner(engine, target):
        entered.set()
        if not release.wait(timeout=2):
            raise RuntimeError("Test did not release the worker")
        return {"engine": engine, "status": "completed", "records": [target]}

    manager = LocalEngineJobManager(runner=paused_runner)
    try:
        jobs = [manager.submit("sherlock", "exampleuser") for _ in range(3)]
        assert entered.wait(1)
        with pytest.raises(LocalQueueFull):
            manager.submit("sherlock", "exampleuser")
        release.set()
        assert all(_wait_finished(manager, job["job_id"])["status"] == "completed" for job in jobs)
    finally:
        release.set()
        manager.close()


def test_job_queue_failures_do_not_expose_raw_exceptions(monkeypatch):
    monkeypatch.setattr(local_engine_jobs, "validate_local_job", lambda *_: None)

    def bad_runner(*_):
        raise RuntimeError("secret stuff in exception")

    manager = LocalEngineJobManager(runner=bad_runner)
    try:
        item = manager.submit("amass", "example.org")
        done = _wait_finished(manager, item["job_id"])
        assert done["status"] == "failed"
        assert "secret" not in done["error"]
    finally:
        manager.close()


def test_local_http_api_no_token_and_only_on_loopback(monkeypatch):
    class FakeManager:
        def submit(self, engine, target):
            return {"job_id": "a" * 32, "engine": engine, "target": target, "status": "queued"}

        def get(self, job_id):
            if job_id == "a" * 32:
                return {"job_id": job_id, "status": "completed", "result": {"records": ["example.org"]}}
            return None

    monkeypatch.setattr(main, "get_local_engine_jobs", lambda: FakeManager())
    request = {"engine": "spiderfoot", "value": "example.org"}
    with TestClient(main.app) as client:
        response = client.post("/api/v1/local-engines/jobs", json=request)
        assert response.status_code == 202
        assert client.get("/api/v1/local-engines/jobs/" + "a" * 32).json()["status"] == "completed"
        assert client.get("/api/v1/local-engines/jobs/no-such-job").status_code == 404
        assert client.post("/api/v1/local-engines/jobs", json=request,
                           headers={"Origin": "https://attacker.example"}).status_code == 403
        assert client.get("/api/v1/local-engines/jobs/" + "a" * 32,
                          headers={"Host": "attacker.example"}).status_code == 403
        assert client.post("/api/v1/local-engines/jobs", json=request,
                           headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
