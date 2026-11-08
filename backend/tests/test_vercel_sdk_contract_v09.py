"""SDK contract: use real pinned packages but perform zero network calls."""
from __future__ import annotations
import sys
import types
import pytest
from protocolo_osint import engine_queue


def test_queue_is_shared_across_deployments(monkeypatch):
    created = []
    sentinel = object()
    class FakeQueueClient:
        def __init__(self, *, region, deployment):
            created.append((region, deployment))
        async def send(self, *args, **kwargs):
            return "mock-message"
        async def poll(self, *args, **kwargs):
            if False: yield None
    monkeypatch.setitem(sys.modules, "vercel.queue",
                        types.SimpleNamespace(QueueClient=FakeQueueClient, ALL_DEPLOYMENTS=sentinel))
    a = engine_queue._queue_client()
    b = engine_queue._queue_client()
    assert created == [("gru1", sentinel), ("gru1", sentinel)]
    assert callable(a.send) and callable(b.poll)


def test_real_queue_sdk_has_expected_contract():
    """A package install without these exports must break CI before production."""
    from vercel.queue import QueueClient, ALL_DEPLOYMENTS
    assert callable(QueueClient)
    client = QueueClient(region="gru1", deployment=ALL_DEPLOYMENTS)
    assert callable(client.send)
    assert callable(client.poll)


def test_real_blob_sdk_has_expected_contract():
    from vercel.blob import put_blob, get_blob, BlobNotFoundError
    assert callable(put_blob) and callable(get_blob)
    assert issubclass(BlobNotFoundError, Exception)


def test_sender_uses_shared_client_without_external_requests(monkeypatch):
    seen = []
    async def send(topic, payload, **options):
        seen.append((topic, payload, options))
        return "local-test-only"
    class FakeClient:
        send = staticmethod(send)
    monkeypatch.setattr(engine_queue, "_queue_client", lambda: FakeClient())
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")
    result = __import__("asyncio").run(engine_queue.submit(
        "sherlock", "exampleuser", authenticated=True))
    assert result["status"] == "queued"
    assert seen[0][0] == engine_queue.TOPIC
    assert seen[0][1]["engine"] == "sherlock"
    assert "idempotency_key" in seen[0][2]


def test_submission_blocked_without_authorization(monkeypatch):
    monkeypatch.setenv("OSINT_ENGINE_QUEUE_ENABLED", "1")
    with pytest.raises(engine_queue.EngineError):
        __import__("asyncio").run(engine_queue.submit(
            "sherlock", "exampleuser", authenticated=False))
