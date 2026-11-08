"""HTTP security gates and accurate inventory for optional hosted engines."""
from fastapi.testclient import TestClient
from protocolo_osint.hosted_api import app

client = TestClient(app)


def test_inventory_does_not_claim_everything_works():
    response=client.get('/api/v1/engines')
    assert response.status_code == 200
    data=response.json()
    assert len(data['engines']) == 5
    assert all('installed' in x and 'runnable' in x and 'reason' in x for x in data['engines'])


def test_execution_disabled_by_default(monkeypatch):
    monkeypatch.delenv('OSINT_ENGINE_EXECUTION_ENABLED', raising=False)
    response=client.post('/api/v1/engines/run',json={'engine':'sherlock','value':'exampleuser'})
    assert response.status_code == 503


def test_execution_requires_a_configured_secret(monkeypatch):
    monkeypatch.setenv('OSINT_ENGINE_EXECUTION_ENABLED','1')
    monkeypatch.delenv('OSINT_ENGINE_TOKEN', raising=False)
    response=client.post('/api/v1/engines/run',json={'engine':'sherlock','value':'exampleuser'},headers={'Authorization':'Bearer guessed'})
    assert response.status_code == 503


def test_wrong_credential_is_rejected(monkeypatch):
    monkeypatch.setenv('OSINT_ENGINE_EXECUTION_ENABLED','1')
    monkeypatch.setenv('OSINT_ENGINE_TOKEN','long-test-secret-not-for-production-0000000')
    response=client.post('/api/v1/engines/run',json={'engine':'sherlock','value':'exampleuser'},headers={'Authorization':'Bearer wrong'})
    assert response.status_code == 401


def test_authorized_request_calls_selected_engine(monkeypatch):
    monkeypatch.setenv('OSINT_ENGINE_EXECUTION_ENABLED','1')
    monkeypatch.setenv('OSINT_ENGINE_TOKEN','long-test-secret-not-for-production-0000000')
    from protocolo_osint import hosted_api
    seen={}
    def fake_run(engine,value):
        seen.update(engine=engine,value=value)
        return {'engine':engine,'query':value,'status':'completed','records':[]}
    monkeypatch.setattr(hosted_api,'execute_engine',fake_run)
    response=client.post('/api/v1/engines/run',json={'engine':'sherlock','value':'exampleuser'},headers={'Authorization':'Bearer long-test-secret-not-for-production-0000000'})
    assert response.status_code == 200
    assert seen=={'engine':'sherlock','value':'exampleuser'}
    assert response.json()['records']==[]


def test_unrecognized_engine_validation(monkeypatch):
    monkeypatch.setenv('OSINT_ENGINE_EXECUTION_ENABLED','1')
    monkeypatch.setenv('OSINT_ENGINE_TOKEN','long-test-secret-not-for-production-0000000')
    response=client.post('/api/v1/engines/run',json={'engine':'arbitrary','value':'exampleuser'},headers={'Authorization':'Bearer long-test-secret-not-for-production-0000000'})
    assert response.status_code==422


def test_real_worker_heartbeat_changes_catalog_without_running_http_process(monkeypatch):
    from protocolo_osint import hosted_api
    async def fake_heartbeat():
        return {"configured": True, "workers_health": "heartbeat-recent",
                "engines": [{"engine": "amass", "installed": True}, {"engine": "spiderfoot", "installed": True}]}
    monkeypatch.setattr(hosted_api, "engine_queue_capabilities", fake_heartbeat)
    response = client.get("/api/v1/engines")
    assert response.status_code == 200
    data=response.json()
    assert data["workers_health"] == "heartbeat-recent"
    by_id={row["id"]: row for row in data["engines"]}
    for name in ("amass", "spiderfoot"):
        assert by_id[name]["installed"] is True
        assert by_id[name]["status"] == "worker_available"
        assert by_id[name]["runnable"] is False
