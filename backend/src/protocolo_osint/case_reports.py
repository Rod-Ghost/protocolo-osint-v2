"""Generate local case reports in memory, without external network or files."""
from __future__ import annotations
from datetime import datetime, timezone
from io import BytesIO
import re
from xml.sax.saxutils import escape as xml_escape


class ReportNotAvailable(RuntimeError):
    pass


def _clean(value):
    value = str(value or "")
    return "".join(ch for ch in value if ch in "\n\t" or (32 <= ord(ch) != 127))


def _data(case, custody):
    evidence = case.get("evidence", [])
    if len(evidence) > 200:
        raise ValueError("Limite de 200 evidências por relatório.")
    return {
        "case": case, "audit": custody,
        "evidence": evidence,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _sections(data):
    c, a = data["case"], data["audit"]
    yield "Identificação do caso", [
        ("Título", c["title"]), ("Identificador", c["id"]),
        ("Data de criação", c["created_at"]), ("Gerado em UTC", data["generated_at"])
    ]
    yield "Objetivo e escopo", [("Descrição", c.get("description") or "Não informada")]
    items = []
    for i, e in enumerate(data["evidence"], 1):
        items.append((f"Registro {i} - {e['title']}",
                      f"Tipo: {e['kind']}\nID: {e['id']}\nOrigem informada: {e.get('url') or 'Não informada'}"
                      f"\nCriado: {e['created_at']}\nHash de metadados SHA-256: {e['sha256']}"
                      f"\nAnotação: {e.get('note') or 'Não informada'}"))
    yield "Evidências cadastradas", items or [("Sem registros", "Nenhuma evidência cadastrada.")]
    yield "Auditoria de metadados", [
        ("Estado", a["status"]),
        ("Eventos", a["events_count"]),
        ("Último hash", a["latest_hash"]),
        ("Hash do manifesto", a.get("manifest_sha256", "Não calculado")),
        ("Divergências", "; ".join(a["errors"]) if a["errors"] else "Nenhuma detectada")
    ]
    yield "Limitações e validação", [
        ("Fontes", "URLs e registros foram fornecidos pelo investigador; fontes externas não foram verificadas."),
        ("Integridade", "A cadeia verifica metadados e sequência, não os bytes das fontes originais."),
        ("Custódia", "Sem assinatura externa ou carimbo de tempo de terceira parte."),
        ("Natureza", "Relatório técnico preliminar, não constitui laudo pericial.")
    ]


def _markdown(data):
    def esc(value):
        value = _clean(value).replace("\\", "\\\\")
        return re.sub(r"([*_{}\[\]()#+.!|<>])", r"\\\1", value)
    lines = ["# Protocolo OSINT V2 - Relatório investigativo", "",
             "**Documento preliminar; não confirma a autenticidade de fontes externas.**", ""]
    for title, rows in _sections(data):
        lines.extend(["## " + esc(title), ""])
        for label, value in rows:
            lines.extend(["**" + esc(label) + ":**", "", esc(value), ""])
    return ("\n".join(lines) + "\n").encode("utf-8")


def _docx(data):
    try:
        from docx import Document
        from docx.shared import Cm, Pt, RGBColor
    except ImportError as exc:
        raise ReportNotAvailable("Dependências opcionais [reports] não instaladas (DOCX).") from exc
    doc = Document()
    doc.core_properties.title = "Protocolo OSINT V2 - Relatório"
    doc.core_properties.author = "Protocolo OSINT V2"
    sec = doc.sections[0]
    sec.top_margin = sec.bottom_margin = Cm(2.2)
    sec.left_margin = sec.right_margin = Cm(2.4)
    normal = doc.styles["Normal"]
    normal.font.name = "Aptos"
    normal.font.size = Pt(10)
    normal.font.color.rgb = RGBColor(35, 36, 40)
    doc.add_heading("PROTOCOLO OSINT V2", 0)
    doc.add_paragraph("Relatório investigativo - preliminar", "Subtitle")
    for title, rows in _sections(data):
        doc.add_heading(_clean(title), level=1)
        for label, value in rows:
            p = doc.add_paragraph()
            p.add_run(_clean(label) + ": ").bold = True
            p.add_run(_clean(value) or "Não informado")
    sec.footer.paragraphs[0].text = "Protocolo OSINT V2 | Dados locais | Não é laudo pericial"
    output = BytesIO()
    doc.save(output)
    return output.getvalue()


def _pdf(data):
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    except ImportError as exc:
        raise ReportNotAvailable("Dependências opcionais [reports] não instaladas (PDF).") from exc
    output = BytesIO()
    template = SimpleDocTemplate(output, pagesize=A4,
                                 topMargin=45, bottomMargin=45,
                                 leftMargin=43, rightMargin=43,
                                 title="Protocolo OSINT V2 - Relatório")
    title = ParagraphStyle("TitleOSINT", fontName="Helvetica-Bold", fontSize=16,
                           leading=21, spaceAfter=12, splitLongWords=1)
    head = ParagraphStyle("HeadOSINT", fontName="Helvetica-Bold", fontSize=12,
                          leading=16, spaceBefore=14, spaceAfter=6,
                          textColor=colors.HexColor("#C8324A"), splitLongWords=1)
    label = ParagraphStyle("LabelOSINT", fontName="Helvetica-Bold", fontSize=9,
                           leading=12, spaceBefore=7, spaceAfter=3, splitLongWords=1)
    body = ParagraphStyle("BodyOSINT", fontName="Helvetica", fontSize=9,
                          leading=13, spaceAfter=6, splitLongWords=1)
    parts = [Paragraph("PROTOCOLO OSINT V2", title),
             Paragraph("Relatório preliminar; nenhuma fonte externa foi confirmada.", body),
             Spacer(1, 10)]
    for heading, rows in _sections(data):
        parts.append(Paragraph(xml_escape(_clean(heading)), head))
        for caption, value in rows:
            parts.append(Paragraph(xml_escape(_clean(caption)), label))
            parts.append(Paragraph(xml_escape(_clean(value)).replace("\n", "<br/>") or "Não informado", body))
    template.build(parts)
    return output.getvalue()


def export(case: dict, custody: dict, file_format: str) -> tuple[bytes, str, str]:
    data = _data(case, custody)
    if file_format == "md":
        return _markdown(data), "text/markdown; charset=utf-8", "md"
    if file_format == "docx":
        return _docx(data), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"
    if file_format == "pdf":
        return _pdf(data), "application/pdf", "pdf"
    raise ValueError("Formato não suportado.")
