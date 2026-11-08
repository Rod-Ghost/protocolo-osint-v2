"""Offline, deterministic OSINT evidence analysis. No scraping or network calls.

Inputs are supplied by the investigator. Outputs are observations, never identity
claims. This is NOT a substitute for chain-of-custody or verified source capture.
"""
from __future__ import annotations
from collections import Counter, defaultdict
from datetime import datetime, timezone
from email import policy
from email.parser import Parser
from hashlib import sha256
from ipaddress import ip_address
from urllib.parse import urlsplit
import json
import re

MAX_ITEMS=100
MAX_TEXT=12000
SHA_RE=re.compile(r"^[a-fA-F0-9]{64}$")
URL_RE=re.compile(r"https?://[^\s<>\"']+",re.I)
EMAIL_RE=re.compile(r"(?<![\w.-])[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}(?![\w.-])")
DOMAIN_RE=re.compile(r"(?<![\w.-])(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?![\w.-])")
ISO_RE=re.compile(r"\b(?:19|20)\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?\b")
SENSITIVE=re.compile(r"(?i)(?:authorization\s*:|bearer\s+|api[_-]?key\s*[=:]|password\s*[=:]|token\s*[=:])")

def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"))

def digest(value):
    return sha256(canonical(value).encode("utf-8")).hexdigest()

def _bounded(items):
    if len(items)>MAX_ITEMS: raise ValueError("Máximo de 100 registros por operação.")
    return items

def _text(value):
    if not isinstance(value,str) or len(value)>MAX_TEXT: raise ValueError("Texto inválido ou maior que 12.000 caracteres.")
    return value

def _date(value):
    try:
        if not isinstance(value,str): return None
        dt=datetime.fromisoformat(value.replace("Z","+00:00"))
        if dt.tzinfo is None: return dt.date().isoformat()
        return dt.astimezone(timezone.utc).isoformat()
    except (ValueError,TypeError): return None

def timeline(events):
    out=[]
    for i,event in enumerate(_bounded(events)):
        if not isinstance(event,dict): raise ValueError("Evento inválido.")
        date=_date(event.get("date"))
        if not date: continue
        out.append({"date":date,"title":_text(str(event.get("title","")))[:240],
                    "source":_text(str(event.get("source","")))[:500],"index":i})
    out.sort(key=lambda x:(x["date"],x["index"]))
    return {"events":out,"invalid_dates":len(events)-len(out),"external_requests":0}

def entity_extract(text):
    text=_text(text)
    emails=sorted(set(EMAIL_RE.findall(text)),key=str.lower)[:MAX_ITEMS]
    urls=sorted(set(URL_RE.findall(text)))[:MAX_ITEMS]
    domains=sorted(set(DOMAIN_RE.findall(text)),key=str.lower)[:MAX_ITEMS]
    dates=sorted(set(ISO_RE.findall(text)))[:MAX_ITEMS]
    return {"emails":emails,"urls":urls,"domains":domains,"dates":dates,
            "warning":"Extração lexical, sem confirmação de identidade, titularidade ou autenticidade.",
            "external_requests":0}

def source_quality(sources):
    results=[]
    for i,item in enumerate(_bounded(sources)):
        if not isinstance(item,dict): raise ValueError("Fonte inválida.")
        url=str(item.get("url",""))[:1000]
        try:
            parsed=urlsplit(url)
            https=parsed.scheme=="https" and bool(parsed.hostname)
        except ValueError:
            https=False
        observed=_date(item.get("observed_at","")) is not None
        primary=item.get("primary") is True
        independently_confirmed=item.get("independently_confirmed") is True
        # Transparency checklist, NOT a probability of truth.
        checks={"https":https,"dated":observed,"primary":primary,
                "independent_confirmation":independently_confirmed}
        results.append({"index":i,"url":url,"checks":checks,
                        "checklist_score":sum(checks.values()),
                        "notice":"Pontuação de completude documental; não mede veracidade."})
    return {"sources":results,"external_requests":0}

def graph(records):
    nodes={}
    edges=[]
    for i,record in enumerate(_bounded(records)):
        if not isinstance(record,dict): raise ValueError("Relação inválida.")
        left=str(record.get("source","")).strip()[:160]
        right=str(record.get("target","")).strip()[:160]
        if not left or not right or left==right: continue
        for key in (left,right):
            nodes[key]={"id":key,"label":key,"kind":"unverified_entity"}
        evidence=str(record.get("evidence_id","")).strip()[:100]
        edges.append({"source":left,"target":right,"evidence_id":evidence,
                      "relation":str(record.get("relation","associação declarada"))[:100],
                      "verified":False})
    return {"nodes":list(nodes.values()),"edges":edges,
            "warning":"Associações fornecidas pelo operador, não vínculos confirmados.",
            "external_requests":0}

def evidence_manifest(records):
    rows=[]
    for item in _bounded(records):
        if not isinstance(item,dict): raise ValueError("Evidência inválida.")
        hash_value=str(item.get("sha256","")).lower()
        if not SHA_RE.fullmatch(hash_value): raise ValueError("SHA-256 ausente ou inválido.")
        rows.append({"id":str(item.get("id",""))[:100],"sha256":hash_value,
                     "source":str(item.get("source",""))[:1000],
                     "collected_at":_date(item.get("collected_at","")),
                     "description":str(item.get("description",""))[:400]})
    return {"items":rows,"manifest_sha256":digest(rows),
            "warning":"Hash informado pelo operador; bytes originais não verificados pelo servidor.",
            "external_requests":0}

def report(data):
    if not isinstance(data,dict): raise ValueError("Relatório inválido.")
    def clean(v,limit):
        v=_text(str(v))[:limit].replace("\r"," ").replace("\n"," ")
        return v.replace("|","\\|").replace("<","&lt;").replace(">","&gt;")
    title=clean(data.get("title","Investigação OSINT"),160)
    objective=clean(data.get("objective","Não informado"),1000)
    findings=_bounded(data.get("findings",[]))
    lines=["# "+title,"","## Objetivo",objective,"","## Achados e fontes"]
    for i,item in enumerate(findings,1):
        if not isinstance(item,dict): raise ValueError("Achado inválido.")
        lines.extend(["",str(i)+". "+clean(item.get("claim",""),1000),
                      "   - Fonte: "+clean(item.get("source","Não informada"),1000),
                      "   - Limitação: "+clean(item.get("limitation","Não avaliada"),500)])
    lines.extend(["","## Limitações","Conteúdo fornecido pelo investigador. Nenhuma fonte foi verificada automaticamente.",
                  "","## Metodologia","Planejamento → coleta autorizada → verificação → correlação → relatório."])
    result="\n".join(lines)
    return {"markdown":result,"sha256":sha256(result.encode()).hexdigest(),
            "external_requests":0,"notice":"Rascunho técnico, não laudo pericial."}

def email_headers(raw):
    raw=_text(raw)
    if "\n\n" in raw or "\r\n\r\n" in raw: raise ValueError("Envie somente os cabeçalhos, sem corpo da mensagem.")
    parsed=Parser(policy=policy.default).parsestr(raw,headersonly=True)
    def val(name): return str(parsed.get(name,""))[:500]
    received=[str(x)[:500] for x in parsed.get_all("received",[])][:30]
    auth=[str(x)[:500] for x in parsed.get_all("authentication-results",[])][:10]
    return {"from":val("from"),"reply_to":val("reply-to"),"return_path":val("return-path"),
            "message_id":val("message-id"),"received_hops":len(received),
            "received":received,"authentication_results":auth,
            "warning":"Cabeçalhos podem ser forjados. SPF/DKIM/DMARC não foram validados criptograficamente.",
            "external_requests":0}

def url_inspect(url):
    url=_text(url).strip()
    if len(url)>2048: raise ValueError("URL muito longa.")
    try: p=urlsplit(url)
    except ValueError: raise ValueError("URL inválida.")
    if p.scheme not in ("http","https") or not p.hostname: raise ValueError("Somente URLs HTTP(S) válidas.")
    try:
        if p.username or p.password: raise ValueError("Credenciais embutidas em URL são proibidas.")
        port=p.port
    except ValueError as exc:
        raise ValueError("Porta inválida ou credenciais embutidas.") from exc
    try: ip=ip_address(p.hostname); is_ip=True; private=not ip.is_global
    except ValueError: is_ip=False;private=False
    flags=[]
    if p.scheme=="http":flags.append("sem_https")
    if is_ip:flags.append("ip_literal")
    if private:flags.append("ip_nao_publico")
    if "xn--" in p.hostname:flags.append("punycode")
    if port and port not in (80,443):flags.append("porta_incomum")
    return {"hostname":p.hostname.lower(),"scheme":p.scheme,"port":port,
            "flags":flags,"query_present":bool(p.query),
            "warning":"Inspeção sintática apenas; URL não acessada nem reputação verificada.",
            "external_requests":0}

def text_compare(items):
    normalized=[]
    for text in _bounded(items):
        text=_text(text)
        normalized.append(" ".join(text.casefold().split()))
    groups=defaultdict(list)
    for i,value in enumerate(normalized):groups[sha256(value.encode()).hexdigest()].append(i)
    return {"duplicate_groups":[v for v in groups.values() if len(v)>1],
            "distinct_count":len(groups),"method":"normalized-exact-match",
            "warning":"Não é comparação semântica nem detecção de autoria.","external_requests":0}

def methodology():
    return {"stages":[
        {"id":"scope","title":"Escopo e fundamento legal"},
        {"id":"plan","title":"Hipóteses e planejamento de fontes"},
        {"id":"collect","title":"Coleta autorizada e preservação"},
        {"id":"validate","title":"Verificação independente e confiabilidade"},
        {"id":"correlate","title":"Correlação e linha do tempo"},
        {"id":"report","title":"Relatório, limitações e revisão humana"}
    ],"external_requests":0}

OPERATIONS={
 "timeline":timeline,"entities":entity_extract,"source-quality":source_quality,
 "graph":graph,"manifest":evidence_manifest,"report":report,
 "email-headers":email_headers,"url-inspect":url_inspect,
 "text-compare":text_compare,"methodology":lambda _=None:methodology()
}
def analyze(operation,payload):
    if operation not in OPERATIONS:raise ValueError("Operação não suportada.")
    if not isinstance(payload,dict):raise ValueError("Objeto de entrada inválido.")
    if len(canonical(payload))>50000:raise ValueError("Entrada muito grande.")
    key={"timeline":"events","entities":"text","source-quality":"sources",
         "graph":"relations","manifest":"evidence","report":"report",
         "email-headers":"headers","url-inspect":"url",
         "text-compare":"texts","methodology":"_"}[operation]
    value=payload.get(key,[] if key in ("events","sources","relations","evidence","texts") else "")
    return OPERATIONS[operation](value)
