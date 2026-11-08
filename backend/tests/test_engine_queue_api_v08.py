"""HTTP security tests for queue dispatch and result access (no upstream calls)."""
from fastapi.testclient import TestClient
from protocolo_osint.hosted_api import app

client = TestClient(app)


def test_queue_off_by_default(monkeypatch):
    monkeypatch.delenv("OSINT_ENGINE_QUEUE_ENABLED", raising=False)
    assert client.get("/api/v1/engines/queue/capabilities").json()["configured"] is False
    response = client.post("/api/v1/engines/jobs", json={"engine": "sherlock", "value": "exampleuser"})
    assert response.status_code == 503


def test_queue_rejects_no_secret(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")
    monkeypatch.delenv("OSINT_ENGINE_TOKEN", raising=False)
    response = client.post("/api/v1/engines/jobs", json={"engine": "sherlock", "value": "exampleuser"})
    assert response.status_code == 503


def test_queue_rejects_unauthorized(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")
    monkeypatch.setenv("OSINT_ENGINE_TOKEN", "test-only-secret-protecting-admin-00000")
    response = client.post("/api/v1/engines/jobs", json={"engine": "sherlock", "value": "exampleuser"}, headers={"Authorization": "Bearer guessed"})
    assert response.status_code == 401
    response = client.get("/api/v1/engines/jobs/"+"a"*32, headers={"Authorization": "Bearer guessed"})
    assert response.status_code == 401


def test_queue_admin_dispatches_to_verified_method(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")
    secret="test-only-secret-protecting-admin-00000"
    monkeypatch.setenv("OSINT_ENGINE_TOKEN", secret)
    from protocolo_osint import hosted_api
    seen = {}
    async def fake_submit(engine, value, *, authenticated):
        seen.update(engine=engine, value=value, authenticated=authenticated)
        return {"status": "queued", "job_id": "a"*32}
    monkeypatch.setattr(hosted_api, "queue_submit", fake_submit)
    response = client.post("/api/v1/engines/jobs", json={"engine": "amass", "value": "example.org"}, headers={"Authorization": "Bearer "+secret})
    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    assert seen == {"engine": "amass", "value": "example.org", "authenticated": True}


def test_queue_status_validates_job_id_before_storage(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")
    secret="test-only-secret-protecting-admin-00000"
    monkeypatch.setenv("OSINT_ENGINE_TOKEN", secret)
    response = client.get("/api/v1/engines/jobs/../../etc/passwd", headers={"Authorization": "Bearer "+secret})
    assert response.status_code in (404, 422)
    response = client.get("/api/v1/engines/jobs/invalid", headers={"Authorization": "Bearer "+secret})
    assert response.status_code == 422


def test_queue_heartbeat_unconfigured_never_claims_worker(monkeypatch):
    monkeypatch.delenv("OSINT_ENGINE_QUEUE_ENABLED", raising=False)
    result = client.get("/api/v1/engines/queue/capabilities").json()
    assert result["configured"] is False
    assert result["workers_health"] == "unverified"


def test_worker_heartbeat_records_actual_binary_inventory(monkeypatch):
    from protocolo_osint import engine_queue
    async def fake_writer(path, body, **kwargs):
        assert path == "osint-health/worker.json"
        assert kwargs["access"] == "private" and kwargs["allow_overwrite"] is True
        import json
        data = json.loads(body)
        assert len(data["engines"]) == 5
    monkeypatch.setattr(engine_queue, "worker_inventory", lambda: [{"engine": e.id, "installed": False} for e in engine_queue.ENGINES])
    import asyncio
    result = asyncio.run(engine_queue.publish_heartbeat(writer=fake_writer))
    assert len(result["engines"]) == 5
