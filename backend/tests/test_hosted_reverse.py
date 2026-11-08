"""Public route is added without changing the existing hosted API surface."""
from fastapi.testclient import TestClient
from protocolo_osint.hosted_api import app


def test_hosted_image_reverse_disabled_without_env(monkeypatch):
    monkeypatch.delenv('OSINT_REVERSE_ENABLED', raising=False)
    c=TestClient(app)
    assert c.get('/api/v1/images/reverse/config').status_code == 200
    assert c.get('/api/v1/images/reverse/config').json()['configured'] is False
    assert c.post('/api/v1/images/reverse',json={'mime_type':'image/png','content_base64':'AAAA'}).status_code == 503
    assert c.get('/api/v1/cases').status_code == 404
