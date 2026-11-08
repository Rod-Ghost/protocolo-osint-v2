"""Local-first Engine Studio: no account or token, but no public CLI exposure."""
from fastapi.testclient import TestClient

from protocolo_osint import local_engines, main
from protocolo_osint.hosted_api import app as public_app


def test_local_inventory_matches_engine_ui_and_requires_installation(monkeypatch):
    monkeypatch.setenv("OSINT_ENABLE_LOCAL_ENGINES", "1")
    monkeypatch.setattr(local_engines.shutil, "which", lambda name: "/usr/bin/" + name if name != "spiderfoot" else None)
    records = local_engines.inventory()
    assert {x["id"] for x in records} == {"sherlock", "maigret", "subfinder", "amass", "spiderfoot"}
    for item in records:
        assert {"title", "source", "input_kind", "status", "runnable", "installed", "reason"} <= item.keys()
    assert all(x["status"] == "ready" and x["runnable"] for x in records if x["id"] != "spiderfoot")
    assert next(x for x in records if x["id"] == "spiderfoot")["runnable"] is False


def test_local_inventory_is_not_runnable_without_opt_in(monkeypatch):
    monkeypatch.delenv("OSINT_ENABLE_LOCAL_ENGINES", raising=False)
    monkeypatch.setattr(local_engines.shutil, "which", lambda name: "/usr/bin/" + name)
    assert not any(item["runnable"] for item in local_engines.inventory())


def test_local_engine_run_does_not_require_admin_token(monkeypatch):
    monkeypatch.setattr(main, "run", lambda engine, value: {
        "engine": engine, "query": value, "returncode": 0,
        "stdout": "demo.example.org", "stderr": "", "notice": "Resultado simulado de teste."
    })
    with TestClient(main.app) as client:
        response = client.post("/api/v1/engines/run", json={"engine": "subfinder", "value": "example.org"})
    assert response.status_code == 200
    assert response.json()["stdout"] == "demo.example.org"


def test_local_engine_run_rejects_external_origin(monkeypatch):
    monkeypatch.setattr(main, "run", lambda engine, value: {"engine": engine})
    with TestClient(main.app) as client:
        response = client.post("/api/v1/engines/run",
                               headers={"Origin": "https://untrusted.example"},
                               json={"engine": "subfinder", "value": "example.org"})
    assert response.status_code == 403


def test_local_engine_run_rejects_dns_rebinding_host(monkeypatch):
    monkeypatch.setattr(main, "run", lambda engine, value: {"engine": engine})
    with TestClient(main.app) as client:
        response = client.post("/api/v1/engines/run",
                               headers={"Host": "untrusted.example"},
                               json={"engine": "subfinder", "value": "example.org"})
    assert response.status_code == 403


def test_local_engine_run_rejects_cross_site_navigation(monkeypatch):
    monkeypatch.setattr(main, "run", lambda engine, value: {"engine": engine})
    with TestClient(main.app) as client:
        response = client.post("/api/v1/engines/run",
                               headers={"Sec-Fetch-Site": "cross-site"},
                               json={"engine": "subfinder", "value": "example.org"})
    assert response.status_code == 403


def test_hosted_engine_endpoints_remain_disabled_without_admin_configuration(monkeypatch):
    monkeypatch.delenv("OSINT_ENGINE_EXECUTION_ENABLED", raising=False)
    monkeypatch.delenv("OSINT_ENGINE_QUEUE_ENABLED", raising=False)
    payload = {"engine": "subfinder", "value": "example.org"}
    with TestClient(public_app) as client:
        assert client.post("/api/v1/engines/run", json=payload).status_code == 503
        assert client.post("/api/v1/engines/jobs", json=payload).status_code == 503
