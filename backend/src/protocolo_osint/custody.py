"""Tamper-evident LOCAL metadata journal for OSINT case records.

This is not trusted timestamping, hardware signing, encrypted storage,
a forensic image, or proof that a remote source existed. A person who can
edit the SQLite file and its schema can rewrite the journal. Treat the
journal as an auditable integrity control, NOT court-ready chain of custody.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import Any

GENESIS = "0" * 64
VALID_KINDS = {"case_created", "evidence_registered", "image_indexed"}


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def install(db: sqlite3.Connection) -> None:
    """Additive migration: existing case and evidence tables are untouched."""
    db.executescript("""
        CREATE TABLE IF NOT EXISTS custody_events (
            case_id TEXT NOT NULL,
            case_seq INTEGER NOT NULL CHECK(case_seq > 0),
            kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            recorded_at TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            previous_hash TEXT NOT NULL,
            event_hash TEXT NOT NULL,
            PRIMARY KEY (case_id, case_seq),
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS custody_events_case_idx ON custody_events(case_id, case_seq);
        CREATE TRIGGER IF NOT EXISTS custody_events_no_update
        BEFORE UPDATE ON custody_events BEGIN
            SELECT RAISE(ABORT, 'custody events are immutable');
        END;
        CREATE TRIGGER IF NOT EXISTS custody_events_no_delete
        BEFORE DELETE ON custody_events BEGIN
            SELECT RAISE(ABORT, 'custody events cannot be deleted');
        END;
    """)


def append(db: sqlite3.Connection, case_id: str, kind: str,
           target_id: str, payload: dict, recorded_at: str) -> dict:
    """Caller must hold a write transaction (BEGIN IMMEDIATE)."""
    if kind not in VALID_KINDS:
        raise ValueError("Tipo de evento de custódia inválido.")
    row = db.execute(
        "SELECT case_seq,event_hash FROM custody_events "
        "WHERE case_id=? ORDER BY case_seq DESC LIMIT 1", (case_id,)
    ).fetchone()
    case_seq = row["case_seq"] + 1 if row else 1
    previous_hash = row["event_hash"] if row else GENESIS
    signed = {"case_id": case_id, "case_seq": case_seq, "kind": kind,
              "target_id": target_id, "recorded_at": recorded_at,
              "payload": payload, "previous_hash": previous_hash}
    event_hash = sha256_json(signed)
    db.execute(
        "INSERT INTO custody_events "
        "(case_id,case_seq,kind,target_id,recorded_at,payload_json,previous_hash,event_hash) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (case_id, case_seq, kind, target_id, recorded_at, canonical(payload),
         previous_hash, event_hash)
    )
    return {**signed, "event_hash": event_hash}


def _current_rows(db, case_id: str) -> tuple[dict | None, dict, dict]:
    row = db.execute("SELECT * FROM cases WHERE id=?", (case_id,)).fetchone()
    case = dict(row) if row is not None else None
    evidence = {r["id"]: dict(r) for r in db.execute(
        "SELECT * FROM evidence WHERE case_id=?", (case_id,)
    ).fetchall()}
    images = {r["id"]: dict(r) for r in db.execute(
        "SELECT * FROM image_index WHERE case_id=?", (case_id,)
    ).fetchall()}
    return case, evidence, images


def inspect(db: sqlite3.Connection, case_id: str, *, include_events=False) -> dict | None:
    """Check chain, current record snapshots and old-record migration gaps.

    Errors in the stored ledger must never be silently repaired or overwritten.
    """
    case, evidence, images = _current_rows(db, case_id)
    if case is None:
        return None
    stored = db.execute(
        "SELECT * FROM custody_events WHERE case_id=? ORDER BY case_seq",
        (case_id,)
    ).fetchall()
    errors: list[str] = []
    legacy = False
    prior = GENESIS
    previous_seq = 0
    seen_case = False
    seen_evidence: set[str] = set()
    seen_images: set[str] = set()
    events: list[dict] = []
    for row in stored:
        entry = dict(row)
        seq = entry["case_seq"]
        if seq != previous_seq + 1:
            errors.append(f"Sequência de custódia interrompida no evento {seq}.")
        previous_seq = seq
        if entry["previous_hash"] != prior:
            errors.append(f"Hash anterior divergente no evento {seq}.")
        prior = entry["event_hash"]
        try:
            payload = json.loads(entry["payload_json"])
            if not isinstance(payload, dict):
                raise ValueError()
        except (ValueError, TypeError):
            errors.append(f"Registro inválido no evento {seq}.")
            continue
        signed = {"case_id": entry["case_id"], "case_seq": seq,
                  "kind": entry["kind"], "target_id": entry["target_id"],
                  "recorded_at": entry["recorded_at"], "payload": payload,
                  "previous_hash": entry["previous_hash"]}
        if sha256_json(signed) != entry["event_hash"]:
            errors.append(f"Conteúdo do evento {seq} foi alterado.")
        kind, target = entry["kind"], entry["target_id"]
        if kind == "case_created":
            seen_case = True
            if target != case_id or payload != case:
                errors.append(f"Metadados do caso divergentes no evento {seq}.")
        elif kind == "evidence_registered":
            seen_evidence.add(target)
            if evidence.get(target) != payload:
                errors.append(f"Evidência ausente ou alterada no evento {seq}.")
        elif kind == "image_indexed":
            seen_images.add(target)
            if images.get(target) != payload:
                errors.append(f"Índice de imagem ausente ou alterado no evento {seq}.")
        else:
            errors.append(f"Tipo de evento inesperado no evento {seq}.")
        if include_events:
            events.append({**signed, "event_hash": entry["event_hash"]})
    if not seen_case or set(evidence) != seen_evidence or set(images) != seen_images:
        legacy = True
    # Historical evidence rows from v0.4 carried a metadata SHA-256. Verify
    # those hashes even if the original case predates the append-only journal.
    for item in evidence.values():
        metadata = {k: v for k, v in item.items() if k != "sha256"}
        if sha256_json(metadata) != item["sha256"]:
            errors.append(f"Hash de metadados divergente na evidência {item['id']}.")
    status = "tampered" if errors else "legacy_unsealed" if legacy else "verified_metadata_chain"
    result = {
        "case_id": case_id, "status": status, "valid": not errors and not legacy,
        "events_count": len(stored), "latest_hash": prior,
        "legacy_records_present": legacy, "errors": errors[:40],
        "limitations": [
            "Verifica metadados e sequência, não os bytes originais das fontes externas.",
            "SQLite local não possui assinatura externa nem carimbo de tempo confiável.",
            "Alguém com acesso integral ao banco pode substituir também o histórico."
        ]
    }
    if include_events:
        result["events"] = events
        result["manifest_sha256"] = sha256_json({
            "case_id": case_id, "status": status, "events": events,
            "case": case, "evidence": evidence, "images": images
        })
    return result
