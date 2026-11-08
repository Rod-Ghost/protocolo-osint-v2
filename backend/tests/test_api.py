from fastapi.testclient import TestClient
from protocolo_osint.detection import detect_type
from protocolo_osint.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_classification():
    cases = {
        "127.0.0.1": "ip",
        "2001:db8::1": "ip",
        "example.org": "domain",
        "contato@example.org": "email",
        "https://example.org/path?q=1": "url",
        "@investigador": "username_candidate",
        "busca aberta": "free_text",
    }
    for value, expected in cases.items():
        assert detect_type(value) == expected


def test_api_does_not_trigger_collection():
    response = client.post("/api/v1/detect", json={"value": "example.org"})
    assert response.status_code == 200
    assert response.json() == {"kind": "domain", "value": "example.org", "external_requests": 0}


def test_reject_blank_control_char_and_oversized():
    for value in ["  ", "a\nb", "x" * 513]:
        response = client.post("/api/v1/detect", json={"value": value})
        assert response.status_code == 422


def test_malformed_url_does_not_crash():
    response = client.post("/api/v1/detect", json={"value": "http://["})
    assert response.status_code == 200
    assert response.json()["kind"] == "free_text"
