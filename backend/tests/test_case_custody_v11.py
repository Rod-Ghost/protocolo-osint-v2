"""Append-only metadata custody: realistic local SQLite, no network calls."""
from __future__ import annotations
import hashlib
import sqlite3
import pytest
from fastapi.testclient import TestClient

from protocolo_osint.store import Store, canonical
from protocolo_osint.main import app
from protocolo_osint.store import get_store


def test_chain_valid_for_new_case_and_evidence(tmp_path):
    store=Store(tmp_path/"case-data")
    case=store.create_case("Case A","Lab data")
    item=store.add_evidence(case["id"],"reference","Example","https://example.org","Note")
    store.add_image(case["id"],"example.png","a"*64,"f"*16)
    check=store.custody(case["id"],include_events=True)
    assert check["status"]=="verified_metadata_chain"
    assert check["valid"] is True
    assert check["events_count"]==3
    assert [x["kind"] for x in check["events"]]==[
        "case_created","evidence_registered","image_indexed"]
    assert len(check["manifest_sha256"])==64
    assert check["events"][1]["payload"]["sha256"]==item["sha256"]


def test_chain_detects_evidence_tampering(tmp_path):
    store=Store(tmp_path/"data")
    case=store.create_case("Case A","")
    item=store.add_evidence(case["id"],"note","Record",None,"Original")
    with sqlite3.connect(store.db_path) as db:
        db.execute("UPDATE evidence SET note=? WHERE id=?",("Altered",item["id"]))
    check=store.custody(case["id"])
    assert check["status"]=="tampered"
    assert check["valid"] is False
    assert any("divergent" in e.lower() or "alterad" in e.lower() for e in check["errors"])


def test_ledger_update_delete_blocked_by_sqlite_triggers(tmp_path):
    store=Store(tmp_path/"data")
    case=store.create_case("Case A","")
    with sqlite3.connect(store.db_path) as db:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("DELETE FROM custody_events WHERE case_id=?",(case["id"],))
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("UPDATE custody_events SET event_hash=? WHERE case_id=?",("0"*64,case["id"]))


def test_chain_detects_broken_hash_after_privileged_trigger_removal(tmp_path):
    store=Store(tmp_path/"data")
    case=store.create_case("Case A","")
    with sqlite3.connect(store.db_path) as db:
        db.execute("DROP TRIGGER custody_events_no_update")
        db.execute("UPDATE custody_events SET event_hash=? WHERE case_id=?",("a"*64,case["id"]))
    assert store.custody(case["id"])["status"]=="tampered"


def test_legacy_case_is_never_backfilled_as_if_it_had_a_journal(tmp_path):
    store=Store(tmp_path/"data")
    case_id="a"*32
    record={"id":case_id,"title":"Legacy","description":"Preserved","created_at":"2025-01-01T00:00:00+00:00"}
    with sqlite3.connect(store.db_path) as db:
        db.execute("INSERT INTO cases(id,title,description,created_at) VALUES (:id,:title,:description,:created_at)",record)
    again=Store(tmp_path/"data")
    check=again.custody(case_id)
    assert check["status"]=="legacy_unsealed"
    assert check["events_count"]==0
    assert again.get_case(case_id)["title"]=="Legacy"
    note=again.add_evidence(case_id,"note","Additional",None,"New")
    after=again.custody(case_id)
    assert note and after["events_count"]==1
    assert after["status"]=="legacy_unsealed"


def test_api_custody_and_export_preserve_existing_shape(monkeypatch,tmp_path):
    monkeypatch.setenv("OSINT_DATA_DIR",str(tmp_path/"safe"))
    get_store.cache_clear()
    try:
        with TestClient(app) as client:
            case=client.post("/api/v1/cases",json={"title":"Auditable case"}).json()
            eid=client.post("/api/v1/cases/"+case["id"]+"/evidence",
                            json={"title":"Source","url":"https://example.org"}).json()
            response=client.get("/api/v1/cases/"+case["id"]+"/custody")
            assert response.status_code==200
            assert response.json()["status"]=="verified_metadata_chain"
            exported=client.get("/api/v1/cases/"+case["id"]+"/export").json()
            assert exported["case"]["id"]==case["id"]
            assert exported["custody"]["events_count"]==2
            assert exported["custody"]["valid"] is True
            assert exported["custody"]["events"][1]["target_id"]==eid["id"]
            assert client.get("/api/v1/cases/nonsense/custody").status_code==404
    finally:
        get_store.cache_clear()


def test_remote_client_and_untrusted_origin_denied_for_case_data(monkeypatch,tmp_path):
    monkeypatch.setenv("OSINT_DATA_DIR",str(tmp_path/"safe"))
    get_store.cache_clear()
    try:
        with TestClient(app) as client:
            item=client.post("/api/v1/cases",json={"title":"Private local"}).json()
            bad=client.post("/api/v1/cases",json={"title":"CSRF case"},
                            headers={"Origin":"https://untrusted.example"})
            assert bad.status_code==403
            good=client.get("/api/v1/cases/"+item["id"])
            assert good.status_code==200
    finally:
        get_store.cache_clear()
