"""Real DOCX/PDF generation, in memory and bound to local case records."""
from __future__ import annotations
import io
from zipfile import ZipFile
from fastapi.testclient import TestClient
from protocolo_osint.main import app
from protocolo_osint.store import get_store
from protocolo_osint.case_reports import export


def test_three_case_reports_and_no_files_left(monkeypatch,tmp_path):
    monkeypatch.setenv("OSINT_DATA_DIR",str(tmp_path/"cases"))
    get_store.cache_clear()
    try:
        with TestClient(app) as client:
            c=client.post("/api/v1/cases",json={"title":"Caso demonstrativo",
                "description":"Fontes de laboratório."}).json()
            client.post("/api/v1/cases/"+c["id"]+"/evidence",json={
                "title":"Fonte pública","kind":"reference","url":"https://example.org",
                "note":"Sem validação externa."})
            md=client.get(f"/api/v1/cases/{c['id']}/report?format=md")
            assert md.status_code==200
            assert md.headers["cache-control"]=="no-store"
            assert "Caso demonstrativo" in md.text
            assert "https://example.org" in md.text
            pdf=client.get(f"/api/v1/cases/{c['id']}/report?format=pdf")
            assert pdf.status_code==200 and pdf.content.startswith(b"%PDF")
            assert len(pdf.content)>1500
            docx=client.get(f"/api/v1/cases/{c['id']}/report?format=docx")
            assert docx.status_code==200
            with ZipFile(io.BytesIO(docx.content)) as z:
                xml=z.read("word/document.xml").decode()
                assert "Caso demonstrativo" in xml
                assert "https://example.org" in xml
            assert not any(x.suffix in {".pdf",".docx",".md"} for x in tmp_path.rglob("*"))
            assert client.get("/api/v1/cases/missing/report?format=pdf").status_code==404
            assert client.get(f"/api/v1/cases/{c['id']}/report?format=txt").status_code==422
    finally:
        get_store.cache_clear()


def test_report_markdown_escapes_user_input_and_limits():
    c={"id":"a"*32,"title":"Example **unsafe**","description":"[Link](unsafe)",
       "created_at":"2026-11-08","evidence":[]}
    audit={"status":"legacy_unsealed","events_count":0,
           "latest_hash":"0"*64,"errors":[],"manifest_sha256":"a"*64}
    body,_,ext=export(c,audit,"md")
    assert ext=="md"
    assert r"\*\*unsafe\*\*" in body.decode()
    c["evidence"]=[{"id":str(i),"title":"x","kind":"note","url":None,
                    "note":"","sha256":"a"*64,"created_at":"2026-01-01"} for i in range(201)]
    import pytest
    with pytest.raises(ValueError):export(c,audit,"md")
