"""Offline search builder: combines vetted provider links, not search result counts.

No HTTP requests to third-party sites, no scraping, no keys. Operators can
persist these plans in the existing encrypted browser vault independently.
"""
from __future__ import annotations

import re
from urllib.parse import quote, urlsplit

from .catalog import SOURCES
from .detection import detect_type

_WEB_DORK_IDS = frozenset({"google", "google-news", "google-images", "google-pdf",
                            "email-google", "username-google", "linkedin",
                            "instagram", "facebook", "x"})
_ALLOWED_TYPES = frozenset({"auto", "free_text", "username_candidate",
                             "email", "domain", "ip", "url"})
_ALLOWED_FILES = frozenset({"", "pdf", "docx", "xlsx", "csv", "txt"})
_SITE = re.compile(r"(?i)^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
_NO_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
class BuilderError(ValueError):
    pass


def _clean(value, size=180):
    if not isinstance(value, str):
        raise BuilderError("Campo de busca inválido.")
    value = value.strip()
    if len(value) > size or _NO_CONTROL.search(value):
        raise BuilderError("Texto longo demais ou com caracteres de controle.")
    return value


def build_search_plan(value: str, source_ids: list[str], *,
                      kind: str = "auto", filters: dict | None = None) -> dict:
    """Build URLs from our own allowlisted templates. No outbound requests."""
    value = _clean(value, 240)
    if len(value) < 2:
        raise BuilderError("Informe um termo de pelo menos 2 caracteres.")
    if kind not in _ALLOWED_TYPES:
        raise BuilderError("Tipo de pesquisa não suportado.")
    if not isinstance(source_ids, list) or not 1 <= len(source_ids) <= 25:
        raise BuilderError("Selecione de 1 a 25 fontes.")
    if any(not isinstance(x, str) or len(x) > 60 for x in source_ids):
        raise BuilderError("Fonte inválida.")
    chosen = list(dict.fromkeys(source_ids))
    by_id = {x.id: x for x in SOURCES}
    if any(x not in by_id for x in chosen):
        raise BuilderError("Uma ou mais fontes não estão no catálogo autorizado.")
    filters = filters or {}
    if not isinstance(filters, dict):
        raise BuilderError("Operadores inválidos.")
    exact = filters.get("exact", False)
    if not isinstance(exact, bool):
        raise BuilderError("Operador de frase exata inválido.")
    site = _clean(filters.get("site", ""), 120).lower()
    filetype = _clean(filters.get("filetype", ""), 10).lower()
    exclude = _clean(filters.get("exclude", ""), 100)
    if site and (not _SITE.fullmatch(site) or site.endswith((".local",".internal",".test",".invalid"))):
        raise BuilderError("Site deve ser domínio público sem protocolo.")
    if filetype not in _ALLOWED_FILES:
        raise BuilderError("Extensão de documento não permitida.")
    negatives = exclude.split()
    if len(negatives) > 4 or any(not re.fullmatch(r"[\w-]{2,30}",word,re.UNICODE) for word in negatives):
        raise BuilderError("Exclusões: até quatro termos simples, separados por espaços.")
    if any(x in value for x in ("\x00", "\r", "\n")):
        raise BuilderError("Informe uma consulta em uma só linha.")
    try:
        detected = detect_type(value) if kind == "auto" else kind
    except ValueError as exc:
        raise BuilderError(str(exc)) from exc
    dork = ('"' + value.replace('"', "") + '"' if exact else value)
    if site: dork += " site:" + site
    if filetype: dork += " filetype:" + filetype
    for neg in negatives: dork += " -" + neg
    results = []
    skipped = []
    for identifier in chosen:
        source = by_id[identifier]
        if detected not in source.kinds and "free_text" not in source.kinds:
            skipped.append({"id":identifier,"reason":"Tipo incompatível com esta fonte."})
            continue
        # Only sources with known Google search-operator support use dorks.
        advanced = identifier in _WEB_DORK_IDS and bool(exact or site or filetype or negatives)
        term = dork if advanced else value
        url = source.template.replace("{query}", quote(term, safe=""))
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            skipped.append({"id":identifier,"reason":"Destino externo inválido."})
            continue
        results.append({"id":source.id,"name":source.name,"category":source.category,
                        "url":url,"query_mode":"advanced" if advanced else "basic",
                        "verified":False})
    return {"query":value,"kind":detected,"results":results,"total":len(results),
            "selected":len(chosen),"skipped":skipped,
            "actual_results":None,"external_requests":0,
            "count_type":"prepared_links_only",
            "notice":"Quantidade de links preparados, NÃO de resultados encontrados. Fontes externas não consultadas."}
