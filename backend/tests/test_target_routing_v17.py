"""Typed OSINT routing regression checks — no third-party scans.

Ensures a dotted username is not treated as a hostname, validates the official
SpiderFoot v4 seed modes, and keeps CLI commands and Queue access bounded.
"""
from __future__ import annotations

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from protocolo_osint import hosted_api
from protocolo_osint.engine_hub import EngineError
from protocolo_osint.engine_queue import process_job, submit, validate_job
from protocolo_osint.engine_worker_runtime import worker_command
from protocolo_osint.target_routing import validate_target, select_engines


@pytest.mark.parametrize(("value", "kind", "normalized"), [
    ("rod.roldan", "username", "rod.roldan"),
    ("publicuser", "username", "publicuser"),
    ("example.org", "domain", "example.org"),
    ("https://example.org/path?id=1", "url", "example.org"),
    ("test@example.org", "email", "test@example.org"),
    ("8.8.8.8", "ip", "8.8.8.8"),
    ("8.8.8.0/28", "cidr", "8.8.8.0/28"),
    ("AS15169", "asn", "15169"),
    ("+5511999999999", "phone", "+5511999999999"),
    ("Maria Silva", "name", "Maria Silva"),
    ("1HesYJSP1QqcyPEjnQ9vzBL1wujruNGe7R", "bitcoin", "1HesYJSP1QqcyPEjnQ9vzBL1wujruNGe7R"),
])
def test_auto_routing_types(value, kind, normalized):
    target = validate_target(value)
    assert (target.kind, target.normalized) == (kind, normalized)
    engines = select_engines(target)
    assert engines and all(x in {"sherlock","maigret","subfinder","amass","spiderfoot"} for x in engines)
    if kind in {"ip","cidr","email","name","phone","asn","bitcoin"}:
        assert engines == ["spiderfoot"]


def test_explicit_username_fixes_ambiguous_dot():
    target = validate_target("alice.dev", "username")
    assert target.kind == "username" and target.normalized == "alice.dev"
    assert select_engines(target) == ["sherlock", "maigret", "spiderfoot"]


@pytest.mark.parametrize(("value", "kind"), [
    ("127.0.0.1", "ip"),
    ("10.0.0.0/8", "cidr"),
    ("8.8.8.0/24", "cidr"),
    ("https://127.0.0.1/admin", "url"),
    ("https://user:pass@example.org/", "url"),
    ("user;rm -rf /", "username"),
    ("untrusted.example", "email"),
    ("+000000000000", "phone"),
    ("AS0", "asn"),
    ("", "auto"),
])
def test_invalid_and_overbroad_target_rejected(value, kind):
    with pytest.raises(EngineError):
        validate_target(value, kind)


def test_other_engines_reject_spiderfoot_only_types():
    target = validate_target("user@example.org")
    with pytest.raises(EngineError):
        select_engines(target, "sherlock")
    with pytest.raises(EngineError):
        select_engines(target, "subfinder")


def test_subfinder_290_no_unsupported_flag():
    args = worker_command("subfinder", "example.org", which=lambda _: "/bin/subfinder")
    assert args[0] == "/bin/subfinder"
    assert "-max-results" not in args
    assert "-rl" in args and args[args.index("-rl") + 1] == "5"
    assert "-max-time" in args


@pytest.mark.parametrize(("input_value", "kind", "seed"), [
    ("rod.roldan", "username", '"rod.roldan"'),
    ("Maria Silva", "name", '"Maria Silva"'),
    ("test@example.org", "email", "test@example.org"),
    ("8.8.8.8", "ip", "8.8.8.8"),
    ("8.8.8.0/28", "cidr", "8.8.8.0/28"),
    ("AS15169", "asn", "15169"),
    ("+5511999999999", "phone", "+5511999999999"),
])
def test_spiderfoot_official_v4_seed_kind(input_value, kind, seed):
    args = worker_command("spiderfoot", input_value,
                          which=lambda _: "/bin/spiderfoot", target_kind=kind)
    assert args[args.index("-s")+1] == seed
    assert args[args.index("-u")+1] == "passive"
    assert args[args.index("-o")+1] == "json"
    assert args[args.index("-max-threads")+1] == "2"


def test_spiderfoot_kind_is_validated_again_on_delivery():
    with pytest.raises(EngineError):
        validate_job("spiderfoot", "127.0.0.1", target_kind="ip")
    assert validate_job("spiderfoot", "rod.roldan", target_kind="username")["target_kind"] == "username"


def test_queue_retains_and_executes_typed_spiderfoot_seed(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")
    messages = []
    async def fake_sender(topic, body, **kwargs):
        messages.append(body)

    queued = asyncio.run(submit(
        "spiderfoot", "test@example.org", authenticated=True,
        operator_id=1234, target_kind="email", sender=fake_sender
    ))
    assert queued["status"] == "queued"
    assert messages[0]["target_kind"] == "email" and messages[0]["operator_id"] == 1234

    calls, saved = [], []
    def fake_runner(engine, target, *, target_kind=None):
        calls.append((engine, target, target_kind))
        return {"status":"completed", "engine":engine, "records": ["verified-only-as-mocked"]}

    async def writer(path, body, **kwargs):
        saved.append(json.loads(body))
        assert kwargs["access"] == "private"

    asyncio.run(process_job(messages[0], engine_runner=fake_runner, blob_writer=writer))
    assert calls == [("spiderfoot", "test@example.org", "email")]
    assert saved[0]["target_kind"] == "email" and saved[0]["operator_id"] == 1234


def test_hosted_auto_username_no_longer_routes_to_domain(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")
    monkeypatch.setattr(hosted_api, "require_operator",
                        lambda request, csrf=False: {"uid": 1234})
    calls = []
    async def fake_submit(engine, target, **kwargs):
        calls.append((engine, target, kwargs))
        return {"status":"queued", "job_id": f"{len(calls):032x}"}
    monkeypatch.setattr(hosted_api, "queue_submit", fake_submit)
    with TestClient(hosted_api.app) as client:
        resp = client.post("/api/v1/operator/search", json={
            "value":"rod.roldan","engine":"auto","target_kind":"auto"
        })
        assert resp.status_code == 202, resp.text
        assert resp.json()["kind"] == "username"
        assert [x["engine"] for x in resp.json()["jobs"]] == [
            "sherlock", "maigret", "spiderfoot"
        ]
        assert all(target == "rod.roldan" for _, target, _ in calls)
        assert calls[-1][2]["target_kind"] == "username"


def test_hosted_url_is_hostname_only_and_no_path_disclosed(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")
    monkeypatch.setattr(hosted_api, "require_operator",
                        lambda request, csrf=False: {"uid": 42})
    received=[]
    async def fake_submit(engine, target, **kwargs):
        received.append((engine,target))
        return {"status":"queued", "job_id": f"{len(received):032x}"}
    monkeypatch.setattr(hosted_api,"queue_submit",fake_submit)
    with TestClient(hosted_api.app) as client:
        response=client.post("/api/v1/operator/search",json={
            "value":"https://example.org/private/path?password=secret","target_kind":"url"
        })
    assert response.status_code == 202
    assert response.json()["normalized_target"] == "example.org"
    assert all(target=="example.org" for _,target in received)
