"""Source-builder audit and regression checks. Never calls external providers."""
from __future__ import annotations

from urllib.parse import unquote, urlsplit
import pytest
from fastapi.testclient import TestClient

from protocolo_osint.catalog import SOURCES
from protocolo_osint.search_builder import BuilderError, build_search_plan
from protocolo_osint.hosted_api import app as hosted_app
from protocolo_osint.main import app as local_app


def test_legacy_catalog_is_extended_not_replaced():
    ids = [s.id for s in SOURCES]
    assert len(ids) == len(set(ids)) == 48
    assert {"google", "bing", "crt", "github", "wayback"} & set(ids) == {"google", "bing", "crt", "github"}
    assert {"startpage", "qwant", "google-scholar", "google-patents",
            "internet-archive", "hn-search", "viewdns-whois"} <= set(ids)


def test_custom_builder_counts_links_not_results():
    data = build_search_plan("rod.roldan", ["google", "github-users", "rdap", "google"])
    assert data["selected"] == 3
    assert data["total"] == 2
    assert {x["id"] for x in data["results"]} == {"google", "github-users"}
    assert len(data["skipped"]) == 1
    assert data["actual_results"] is None and data["external_requests"] == 0
    assert data["count_type"] == "prepared_links_only"
    assert all(x["verified"] is False for x in data["results"])


def test_dorks_are_applied_only_to_allowlisted_google_destinations():
    data = build_search_plan(
        "empresa exemplo", ["google","bing","startpage","google-pdf"],
        kind="free_text",
        filters={"exact":True,"site":"example.org","filetype":"pdf","exclude":"teste spam"}
    )
    assert data["total"] == 4
    urls = {item["id"]:unquote(item["url"]) for item in data["results"]}
    assert '"empresa exemplo" site:example.org filetype:pdf -teste -spam' in urls["google"]
    assert "site:example.org" not in urls["bing"]
    assert "filetype:pdf" not in urls["startpage"]
    assert data["results"][0]["query_mode"] == "advanced"
    assert all(urlsplit(item["url"]).scheme == "https" for item in data["results"])


@pytest.mark.parametrize(("value","ids","filters"),[
    ("a",["google"],{}),
    ("example.org",[],{}),
    ("example.org",["unknown"],{}),
    ("example.org",["google"],{"filetype":"exe"}),
    ("example.org",["google"],{"site":"localhost"}),
    ("example.org",["google"],{"site":"https://example.org"}),
    ("example.org",["google"],{"exclude":"a b c d e"}),
    ("example.org",["google"],{"exact":"yes"}),
])
def test_invalid_builder_input_rejected(value,ids,filters):
    with pytest.raises(BuilderError):
        build_search_plan(value,ids,filters=filters)


def test_hosted_and_local_routes_are_consistent():
    payload={"value":"example.org","source_ids":["google","crt","viewdns-whois"],
             "kind":"domain","filters":{"exact":False}}
    a=TestClient(hosted_app).post("/api/v1/search/builder",json=payload)
    b=TestClient(local_app).post("/api/v1/search/builder",json=payload)
    assert a.status_code == 200 and b.status_code == 200
    assert a.json() == b.json()
    assert a.json()["total"] == 3


def test_custom_builder_does_not_accept_arbitrary_target_urls_or_source_ids():
    response=TestClient(hosted_app).post("/api/v1/search/builder",json={
        "value":"example.org","source_ids":["https://evil.example/"],"kind":"domain"
    })
    assert response.status_code == 422
