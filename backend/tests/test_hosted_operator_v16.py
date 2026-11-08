"""Hosted workflow V1.6: GitHub login and job ownership, without live scans.

All OAuth exchanges, worker submissions, and Blob results are substituted.
The tests must never require or reveal production credentials.
"""
from __future__ import annotations

import asyncio
import json
import sys
import types
from types import SimpleNamespace
from urllib.parse import urlsplit, parse_qs

import pytest
from fastapi.testclient import TestClient

from protocolo_osint import hosted_api, operator_auth, engine_queue


ORIGIN = "https://protocolo-osint-v2-nine.vercel.app"
ADMIN_ID = 1234567


@pytest.fixture
def auth_env(monkeypatch):
    monkeypatch.setenv("OSINT_GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("OSINT_GITHUB_CLIENT_SECRET", "fake-secret-only")
    monkeypatch.setenv("OSINT_SESSION_KEY", "test-session-key-0000000000000000000000000000")
    monkeypatch.setenv("OSINT_ALLOWED_GITHUB_IDS", str(ADMIN_ID))
    monkeypatch.setenv("OSINT_PUBLIC_ORIGIN", ORIGIN)
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")


def _signed_in_client(monkeypatch):
    async def identity(settings, code, verifier):
        assert code == "a" * 16 and len(verifier) >= 43
        return ADMIN_ID, "operator"
    monkeypatch.setattr(operator_auth, "_github_identity", identity)
    client = TestClient(hosted_api.app, base_url=ORIGIN, follow_redirects=False)
    login = client.get("/api/v1/auth/github/start")
    assert login.status_code == 302
    params = parse_qs(urlsplit(login.headers["location"]).query)
    assert params["code_challenge_method"] == ["S256"]
    assert "scope" not in params or params["scope"] == [""]
    callback = client.get("/api/v1/auth/github/callback", params={
        "state": params["state"][0], "code": "a" * 16,
    })
    assert callback.status_code == 303
    state = client.get("/api/v1/auth/status").json()
    assert state["authenticated"] is True and state["csrf"]
    return client, state


def test_hosted_auth_off_by_default(monkeypatch):
    for key in ("OSINT_GITHUB_CLIENT_ID", "OSINT_GITHUB_CLIENT_SECRET",
                "OSINT_SESSION_KEY", "OSINT_PUBLIC_ORIGIN", "OSINT_ALLOWED_GITHUB_IDS"):
        monkeypatch.delenv(key, raising=False)
    client = TestClient(hosted_api.app, base_url=ORIGIN)
    assert client.get("/api/v1/auth/status").json()["configured"] is False
    assert client.get("/api/v1/auth/github/start").status_code == 503
    assert client.post("/api/v1/operator/search", json={"value": "example.org"}).status_code == 503


def test_oauth_pkce_login_signed_cookies_and_logout(auth_env, monkeypatch):
    client, session = _signed_in_client(monkeypatch)
    assert "token" not in json.dumps(session).lower()
    assert session["username"] == "operator"
    assert client.post("/api/v1/auth/logout", headers={
        "Origin": ORIGIN, "X-OSINT-CSRF": session["csrf"],
    }).status_code == 200
    assert client.get("/api/v1/auth/status").json()["authenticated"] is False


def test_oauth_rejects_wrong_state_and_nonoperator(auth_env, monkeypatch):
    client = TestClient(hosted_api.app, base_url=ORIGIN, follow_redirects=False)
    client.get("/api/v1/auth/github/start")
    response = client.get("/api/v1/auth/github/callback", params={"state":"wrong","code":"a"*16})
    assert response.status_code == 403
    async def other_account(settings, code, verifier):
        return ADMIN_ID + 1, "unauthorized"
    monkeypatch.setattr(operator_auth, "_github_identity", other_account)
    begin = client.get("/api/v1/auth/github/start")
    state = parse_qs(urlsplit(begin.headers["location"]).query)["state"][0]
    assert client.get("/api/v1/auth/github/callback", params={
        "state":state,"code":"a"*16
    }).status_code == 403
    assert client.get("/api/v1/auth/status").json()["authenticated"] is False


def test_operator_workflow_auto_username_and_domain(auth_env, monkeypatch):
    client, session = _signed_in_client(monkeypatch)
    submitted=[]
    async def fake_submit(engine, target, *, authenticated, operator_id=None):
        submitted.append((engine,target,authenticated,operator_id))
        return {"engine":engine,"status":"queued","job_id": f"{len(submitted):032x}"}
    monkeypatch.setattr(hosted_api, "queue_submit", fake_submit)
    headers={"Origin": ORIGIN, "X-OSINT-CSRF":session["csrf"]}
    response = client.post("/api/v1/operator/search", headers=headers,json={"value":"publicuser"})
    assert response.status_code == 202
    assert [x["engine"] for x in response.json()["jobs"]] == ["sherlock","maigret"]
    assert all(row[2] is True and row[3] == ADMIN_ID for row in submitted)
    response = client.post("/api/v1/operator/search", headers=headers,json={"value":"example.org"})
    assert response.status_code == 202
    assert [x["engine"] for x in response.json()["jobs"]] == ["subfinder","amass","spiderfoot"]
    assert len(submitted) == 5
    response = client.post("/api/v1/operator/search", headers=headers,json={
        "value":"example.org", "include_spiderfoot":False
    })
    assert [x["engine"] for x in response.json()["jobs"]] == ["subfinder","amass"]


def test_operator_rejects_cross_site_and_unsafe_targets(auth_env, monkeypatch):
    client, session = _signed_in_client(monkeypatch)
    fake_calls=[]
    async def fake_submit(*args,**kwargs):
        fake_calls.append(args)
        return {"job_id":"a"*32,"status":"queued"}
    monkeypatch.setattr(hosted_api, "queue_submit",fake_submit)
    body={"value":"example.org"}
    assert client.post("/api/v1/operator/search", json=body).status_code == 403
    assert client.post("/api/v1/operator/search", headers={
        "Origin":"https://attacker.example","X-OSINT-CSRF":session["csrf"]
    },json=body).status_code == 403
    assert client.post("/api/v1/operator/search", headers={
        "Origin":ORIGIN,"X-OSINT-CSRF":"bad"
    },json=body).status_code == 403
    headers={"Origin":ORIGIN,"X-OSINT-CSRF":session["csrf"]}
    assert client.post("/api/v1/operator/search",headers=headers,json={"value":"http://127.0.0.1/"}).status_code == 422
    assert client.post("/api/v1/operator/search",headers=headers,json={"value":"alice;echo bad"}).status_code == 422
    assert not fake_calls


def test_queue_persists_operator_binding(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED","1")
    captured={}
    async def sender(topic,payload,**kwargs):
        captured.update(payload)
    entry=asyncio.run(engine_queue.submit("sherlock","publicuser",authenticated=True,
                                         sender=sender,operator_id=ADMIN_ID))
    assert captured["operator_id"]==ADMIN_ID
    writes=[]
    async def writer(path,body,**kwargs):
        writes.append(json.loads(body))
    asyncio.run(engine_queue.process_job(captured,blob_writer=writer,
        engine_runner=lambda *_:{"engine":"sherlock","status":"completed","records":["source.example"]}))
    assert writes[0]["operator_id"] == ADMIN_ID and writes[0]["job_id"] == entry["job_id"]


def test_results_restricted_to_own_operator(auth_env,monkeypatch):
    client, session = _signed_in_client(monkeypatch)
    job_id = "a" * 32
    class BlobNotFoundError(Exception):
        pass
    async def get_blob(path, *, access):
        assert path == f"osint-jobs/{job_id}/result.json" and access=="private"
        return SimpleNamespace(body=json.dumps({
            "job_id":job_id,"operator_id":ADMIN_ID+1,
            "status":"completed","records":["sensitive"]}).encode())
    fake = types.ModuleType("vercel.blob")
    fake.BlobNotFoundError=BlobNotFoundError
    fake.get_blob=get_blob
    monkeypatch.setitem(sys.modules,"vercel.blob",fake)
    assert client.get("/api/v1/operator/jobs/"+job_id).status_code == 404
    assert client.get("/api/v1/operator/jobs/invalid").status_code == 422


def test_image_external_requires_operator_and_config(auth_env,monkeypatch):
    client, session=_signed_in_client(monkeypatch)
    payload={"mime_type":"image/png","content_base64":"abcd"}
    assert client.post("/api/v1/operator/images/reverse",json=payload).status_code == 403
    response=client.post("/api/v1/operator/images/reverse",json=payload,
                         headers={"Origin":ORIGIN,"X-OSINT-CSRF":session["csrf"]})
    # No Vision key in CI, so this never sends an image externally.
    assert response.status_code == 503
