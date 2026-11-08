"""AI settings never create a backend inference gateway; local model CSP is scoped."""
from fastapi.testclient import TestClient
from protocolo_osint.hosted_api import app as hosted
from protocolo_osint.main import app as local


def test_hosted_api_uses_no_model_keys_or_unauthenticated_ai_proxy():
    client=TestClient(hosted)
    response=client.get("/")
    assert response.status_code==200
    csp=response.headers["content-security-policy"]
    assert "http://127.0.0.1:11434" in csp
    assert "http://localhost:11434" in csp
    assert "connect-src 'self' https:" in csp
    assert "connect-src 'self' http:;" not in csp
    assert client.post("/api/v1/ai/completions",json={}).status_code==404


def test_local_csp_allows_only_local_ollama_http():
    response=TestClient(local).get("/")
    assert response.status_code==200
    csp=response.headers["content-security-policy"]
    assert "http://127.0.0.1:11434" in csp
    assert "connect-src 'self' https:" in csp
    assert "connect-src 'self' http:" not in csp
