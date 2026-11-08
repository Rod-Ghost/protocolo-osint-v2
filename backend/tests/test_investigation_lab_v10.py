"""Real deterministic analysis tests; no external requests or fabricated confidence."""
from fastapi.testclient import TestClient
from protocolo_osint.hosted_api import app
from protocolo_osint.investigation_lab import analyze, digest
import pytest

client=TestClient(app)

def test_timeline_sorted_and_bad_date_rejected():
    d=analyze("timeline",{"events":[{"date":"2026-11-09","title":"later"},{"date":"2026-11-08","title":"earlier"},{"date":"not-date"}]})
    assert [e["title"] for e in d["events"]]==["earlier","later"]
    assert d["invalid_dates"]==1

def test_graph_requires_provided_evidence_and_never_confirms_identity():
    d=analyze("graph",{"relations":[{"source":"a","target":"b","evidence_id":"e1"}]})
    assert len(d["nodes"])==2 and d["edges"][0]["verified"] is False

def test_manifest_deterministic_and_hash_is_user_supplied():
    evidence=[{"id":"e1","sha256":"a"*64,"source":"https://example.org"}]
    a=analyze("manifest",{"evidence":evidence})
    assert a["manifest_sha256"]==analyze("manifest",{"evidence":evidence})["manifest_sha256"]
    with pytest.raises(ValueError):analyze("manifest",{"evidence":[{"sha256":"nope"}]})

def test_report_escapes_untrusted_markdown_and_cites_source():
    d=analyze("report",{"report":{"title":"<script>alert(1)</script>","findings":[{"claim":"Fato","source":"https://example.org","limitation":"não verificado"}]}})
    assert "<script>" not in d["markdown"]
    assert "https://example.org" in d["markdown"]
    assert len(d["sha256"])==64

def test_email_headers_do_not_claim_authentication():
    d=analyze("email-headers",{"headers":"From: Example <test@example.org>\nReceived: from mx.example.org\nAuthentication-Results: spf=pass"})
    assert d["received_hops"]==1
    assert "não foram validados" in d["warning"]
    with pytest.raises(ValueError):analyze("email-headers",{"headers":"From: a\n\nbody"})

def test_url_analysis_never_fetches():
    d=analyze("url-inspect",{"url":"http://127.0.0.1:8080/path?x=1"})
    assert "ip_nao_publico" in d["flags"] and d["external_requests"]==0
    with pytest.raises(ValueError):analyze("url-inspect",{"url":"file:///etc/passwd"})

def test_extract_entities_and_dates():
    d=analyze("entities",{"text":"test@example.org https://example.org 2026-11-08"})
    assert "test@example.org" in d["emails"]
    assert "2026-11-08" in d["dates"]

def test_quality_is_checklist_not_truth_probability():
    d=analyze("source-quality",{"sources":[{"url":"https://example.org","primary":True,"independently_confirmed":False}]})
    assert d["sources"][0]["checklist_score"]==2
    assert "não mede veracidade" in d["sources"][0]["notice"]

def test_normalized_duplicates_and_methodology():
    d=analyze("text-compare",{"texts":["A  B","a b","different"]})
    assert d["duplicate_groups"]==[[0,1]]
    assert len(analyze("methodology",{})["stages"])==6

def test_bounds_and_unknown_op():
    with pytest.raises(ValueError):analyze("timeline",{"events":[{}]*101})
    with pytest.raises(ValueError):analyze("not-real",{})

def test_public_api_no_network_and_invalid_inputs():
    good=client.post("/api/v1/lab/analyze",json={"operation":"url-inspect","payload":{"url":"https://example.org/path"}})
    assert good.status_code==200 and good.json()["result"]["external_requests"]==0
    assert client.post("/api/v1/lab/analyze",json={"operation":"url-inspect","payload":{"url":"file:///etc/passwd"}}).status_code==422
    assert client.get("/api/v1/lab/capabilities").status_code==200
