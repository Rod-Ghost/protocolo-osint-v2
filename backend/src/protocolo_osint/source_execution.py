"""Source-aware OSINT execution. A directory entry is never counted as a lookup.

The catalogue remains a directory of prepared HTTPS links. Only a fixed,
reviewed source->official API adapter may be run. Unsupported sources are
reported as not queried, not as zero results. No scraping or arbitrary GET.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from time import monotonic
from urllib.parse import urlsplit
from typing import Callable

from .catalog import SOURCES
from .detection import detect_type
from .live_lookup import LookupError, lookup
from .search_builder import build_search_plan, BuilderError

MAX_REMOTE_SOURCES = 5
MAX_SOURCE_SELECTION = 60
# Each mapping has been reviewed against an upstream API; links alone are not adapters.
ADAPTERS: dict[str, dict[str, str]] = {
    "dns-public": {"domain": "dns"},
    "crt": {"domain": "certificates"},
    "github-users": {"username_candidate": "github", "free_text": "github_name"},
    "wikidata": {"free_text": "wikidata_entities"},
    "openalex": {"free_text": "openalex_authors"},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _kind(value: str, kind: str) -> str:
    if kind == "auto":
        try:
            return detect_type(value)
        except ValueError as exc:
            raise BuilderError(str(exc)) from exc
    return kind


def coverage() -> dict:
    sources = []
    for source in SOURCES:
        adapters = ADAPTERS.get(source.id, {})
        sources.append({
            "id": source.id, "name": source.name, "category": source.category,
            "compatible_kinds": list(source.kinds),
            "api_kinds": sorted(adapters),
            "capability": "api_bounded" if adapters else "manual_link",
            "requires_user_action": True,
            "notice": "Catálogo não representa coleta executada.",
        })
    return {"catalog_total": len(sources),
            "api_integrated": sum(bool(x["api_kinds"]) for x in sources),
            "manual_only": sum(not x["api_kinds"] for x in sources),
            "sources": sources,
            "notice": "Apenas fontes com api_kinds possuem conectores reais. "
                      "Uma consulta depende do tipo e do consentimento explícito."}


def _run_one(source_id: str, name: str, provider: str, query: str,
             query_url: str, runner: Callable) -> dict:
    started = monotonic()
    try:
        observed = runner(query, provider)
        if (not isinstance(observed, dict) or observed.get("provider") != provider
                or not isinstance(observed.get("items"), list)
                or observed.get("status") not in {"observed", "no_result"}):
            raise LookupError("Provedor retornou um contrato inesperado.")
        entries = observed["items"][:40]
        status = "observed" if entries else "no_result"
        return {
            "id": source_id, "label": name,
            "status": status, "count": len(entries), "items": entries,
            "provider": provider, "executed": True,
            "observed_at": observed.get("observed_at") or _now(),
            "source_url": observed.get("source_url") or "",
            "query_url": query_url,
            "duration_ms": int((monotonic() - started) * 1000),
            "verification_status": "unverified",
            "notice": "Quantidade de registros retornados; não representa cobertura global "
                      "nem comprovação de identidade.",
        }
    except (LookupError, ValueError) as exc:
        error = str(exc)[:180]
    except Exception:
        error = "Provedor indisponível ou resposta inesperada."
    return {
        "id": source_id, "label": name, "status": "failed",
        "count": None, "items": [], "executed": True,
        "provider": provider, "query_url": query_url, "source_url": "",
        "observed_at": _now(),
        "duration_ms": int((monotonic() - started) * 1000),
        "verification_status": "unverified",
        "notice": error,
    }


def execute_sources(value: str, source_ids: list[str], *,
                    kind: str = "auto", filters: dict | None = None,
                    runner: Callable = lookup) -> dict:
    """Dispatch at most 5 official API requests for one explicit selection.

    Network operations are injected for tests. The return is a complete
    accounting of the selected catalogue sources, including non-executed ones.
    """
    prepared = build_search_plan(value, source_ids, kind=kind, filters=filters)
    target_kind = _kind(value.strip(), kind)
    selected = list(dict.fromkeys(source_ids))
    if not 1 <= len(selected) <= MAX_SOURCE_SELECTION:
        raise BuilderError("Selecione de 1 a 60 fontes.")
    by_id = {s.id: s for s in SOURCES}
    planned = {s["id"]: s["url"] for s in prepared["results"]}
    records: dict[str, dict] = {}
    tasks = []
    for source_id in selected:
        s = by_id[source_id]
        url = planned.get(source_id, "")
        base = {
            "id": s.id, "label": s.name, "status": "not_queried",
            "count": None, "items": [], "executed": False,
            "query_url": url, "source_url": "",
            "observed_at": None, "verification_status": "unverified",
        }
        if not url:
            base["status"] = "incompatible"
            base["notice"] = "Fonte incompatível com o critério escolhido; não consultada."
        else:
            provider = ADAPTERS.get(source_id, {}).get(target_kind)
            if not provider:
                base["notice"] = ("Pesquisa manual: fonte do catálogo sem API automática "
                                  "homologada para este critério. Nenhuma requisição enviada.")
            elif len(tasks) >= MAX_REMOTE_SOURCES:
                base["notice"] = ("Limite por execução atingido. Esta fonte não foi "
                                  "consultada; execute separadamente.")
            else:
                tasks.append((source_id, s.name, provider, value.strip(), url))
                base["status"] = "pending"  # will be replaced before response
                base["notice"] = "Aguardando resposta da API oficial."
        records[source_id] = base
    if tasks:
        with ThreadPoolExecutor(max_workers=min(3, len(tasks))) as executor:
            future_map = {
                executor.submit(_run_one, *task, runner): task[0]
                for task in tasks
            }
            for future in as_completed(future_map):
                sid = future_map[future]
                # _run_one is already failure-isolated; defend against executor errors.
                try:
                    records[sid] = future.result()
                except Exception:
                    records[sid] = {**records[sid],
                        "status": "failed", "executed": True, "count": None,
                        "notice": "Falha interna ao executar o conector."}
    ordered = [records[i] for i in selected]
    summary = {
        "selected": len(ordered),
        "executed": sum(x.get("executed") is True for x in ordered),
        "with_records": sum(x["status"] == "observed" for x in ordered),
        "no_records": sum(x["status"] == "no_result" for x in ordered),
        "failed": sum(x["status"] == "failed" for x in ordered),
        "manual": sum(x["status"] == "not_queried" for x in ordered),
        "incompatible": sum(x["status"] == "incompatible" for x in ordered),
        "returned": sum(x["count"] or 0 for x in ordered),
    }
    return {
        "format": "protocolo-osint/investigation-run-v2",
        "target": value.strip(), "kind": target_kind, "observed_at": _now(),
        "sources": ordered, "summary": summary,
        "counts_are": "returned_records_not_global_search_hits",
        "automatic_requests": len(tasks),
        "notice": "Fontes não executadas são identificadas separadamente. "
                  "Ausência de registros não comprova inexistência. "
                  "Cada achado permanece não verificado.",
    }
