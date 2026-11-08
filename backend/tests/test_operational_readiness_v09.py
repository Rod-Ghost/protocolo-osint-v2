"""Operational status is informational only and never leaks credentials."""
from fastapi.testclient import TestClient
from protocolo_osint.hosted_api import app

client=TestClient(app)

def test_readiness_default_is_off(monkeypatch):
    for key in ("OSINT_ENGINE_QUEUE_ENABLED", "OSINT_ENGINE_TOKEN",
                "BLOB_READ_WRITE_TOKEN", "VERCEL_BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"):
        monkeypatch.delenv(key, raising=False)
    r=client.get("/api/v1/system/readiness")
    assert r.status_code==200
    payload=r.json()
    assert payload["queue"]["configured"] is False
    assert payload["private_blob"]["binding_detected"] is False
    assert payload["can_submit_jobs"] is False

def test_readiness_never_returns_token_values(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED","1")
    monkeypatch.setenv("OSINT_ENGINE_TOKEN","example-only-secret-not-real-00000000")
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN","example-private-blob-token")
    r=client.get("/api/v1/system/readiness")
    assert r.status_code==200
    d=r.json()
    assert d["operator_auth"]["configured"] is True
    assert d["private_blob"]["binding_detected"] is True
    assert d["can_submit_jobs"] is False
    assert "example-only-secret" not in r.text
    assert "example-private-blob-token" not in r.text
