"""Source execution tests do not touch external APIs. All calls are injected."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
import pytest

from protocolo_osint.source_execution import ADAPTERS, coverage, execute_sources
from protocolo_osint.search_builder import BuilderError
from protocolo_osint.hosted_api import app
from fastapi.testclient import TestClient


def fake_runner(query, provider):
    items = [{"login": "candidate", "profile_url": "https://github.com/candidate"}] \
        if provider == "github_name" else (
        [{"id": "Q42", "label": "Candidate", "entity_url": "https://www.wikidata.org/wiki/Q42"}]
        if provider == "wikidata_entities" else [])
    return {
        "provider": provider, "query": query, "items": items,
        "status": "observed" if items else "no_result",
        "count": 9000,  # must NEVER be treated as returned-record count
        "observed_at": "2026-11-10T17:00:00+00:00",
        "source_url": "https://github.com/search?q=synthetic",
    }


def test_catalog_and_execution_count_are_distinct():
    c = coverage()
    assert c["catalog_total"] >= 49
    assert c["api_integrated"] == len(ADAPTERS) == 5
    assert c["manual_only"] == c["catalog_total"] - 5
    assert next(x for x in c["sources"] if x["id"] == "google")["capability"] == "manual_link"
    assert next(x for x in c["sources"] if x["id"] == "wikidata")["api_kinds"] == ["free_text"]


def test_named_subject_reports_all_selected_sources_not_fake_zeros():
    selected = ["google", "github-users", "bing", "wikidata", "openalex",
                "duckduckgo", "youtube"]
    result = execute_sources("Sample Person", selected, kind="free_text", runner=fake_runner)
    assert result["format"] == "protocolo-osint/investigation-run-v2"
    assert [x["id"] for x in result["sources"]] == selected
    assert result["summary"] == {
        "selected": 7, "executed": 3, "with_records": 2,
        "no_records": 1, "failed": 0, "manual": 4,
        "incompatible": 0, "returned": 2,
    }
    assert result["automatic_requests"] == 3
    assert all(x["count"] is None and not x["executed"]
               for x in result["sources"] if x["status"] == "not_queried")
    assert result["sources"][1]["provider"] == "github_name"
    assert result["sources"][1]["count"] == 1


def test_domain_adapters_and_incompatible_sources():
    ids = ["dns-public", "crt", "github-users", "google"]
    result = execute_sources("example.org", ids, kind="domain", runner=fake_runner)
    assert [s["status"] for s in result["sources"]] == [
        "no_result", "no_result", "incompatible", "not_queried",
    ]
    assert result["summary"]["executed"] == 2
    assert result["summary"]["no_records"] == 2


def test_failed_provider_cannot_be_reclassified_as_no_results():
    def fail(_, __):
        raise ValueError("HTTP 429 rate limited")
    r = execute_sources("Test Person", ["github-users", "wikidata"], kind="free_text", runner=fail)
    assert r["summary"]["failed"] == 2
    assert r["summary"]["no_records"] == 0
    assert all(s["count"] is None for s in r["sources"])


def test_invalid_selection_is_rejected_before_any_network():
    called = []
    def spy(*args):
        called.append(args)
        return fake_runner(*args)
    with pytest.raises(BuilderError):
        execute_sources("Test Person", ["not-a-source"], kind="free_text", runner=spy)
    assert not called


def test_public_capability_api_and_manual_lookup_with_no_outbound():
    c = TestClient(app)
    info = c.get("/api/v1/investigations/capabilities")
    assert info.status_code == 200
    assert info.json()["api_integrated"] == 5
    r = c.post("/api/v1/investigations/execute", json={
        "value": "Test Person", "kind": "free_text",
        "source_ids": ["google", "bing"]})
    assert r.status_code == 200
    assert r.json()["summary"]["executed"] == 0
    assert r.json()["summary"]["manual"] == 2
    assert all(s["query_url"].startswith("https://") for s in r.json()["sources"])
    assert all(s["status"] == "not_queried" for s in r.json()["sources"])


def test_duplicate_selected_sources_are_not_double_counted():
    r = execute_sources("Test Person", ["github-users", "github-users"],
                        kind="free_text", runner=fake_runner)
    assert r["summary"]["executed"] == 1
    assert r["summary"]["returned"] == 1
