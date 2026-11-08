"""Optional Google Cloud Vision WEB_DETECTION adapter.

No internet-scale claim without an actual indexed provider response.
The image is sent to one fixed HTTPS provider ONLY after explicit operator action.
No local disk persistence, no arbitrary fetch URLs, no remote URL supplied by user.
"""
from __future__ import annotations

import base64
import binascii
import os
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx

MAX_IMAGE_BYTES = 2_000_000
MAX_RESPONSE_BYTES = 256_000
VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"


class ReverseImageError(ValueError):
    pass


def availability() -> dict:
    key = os.getenv("GOOGLE_CLOUD_VISION_API_KEY", "")
    token = os.getenv("OSINT_REVERSE_TOKEN", "")
    enabled = os.getenv("OSINT_REVERSE_ENABLED") == "1"
    ready = enabled and len(key) >= 16 and len(token) >= 32
    return {
        "id": "google-cloud-vision", "configured": ready,
        "status": "configured" if ready else "needs_configuration",
        "authentication": "operator-token", "external_upload": True,
        "max_image_bytes": MAX_IMAGE_BYTES,
        "notice": "Imagem transmitida ao Google Cloud Vision apenas após confirmação. Pode haver cobrança por consulta. Nenhuma imagem é retida pela API Protocolo OSINT."
    }


def _validate_image(encoded: str, mime_type: str) -> bytes:
    if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise ReverseImageError("Formato inválido. Use PNG, JPEG ou WebP.")
    if not encoded or len(encoded) > ((MAX_IMAGE_BYTES + 2) // 3 * 4 + 4):
        raise ReverseImageError("Imagem excede o limite de 2 MB da consulta externa.")
    try:
        binary = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ReverseImageError("Conteúdo da imagem inválido.") from exc
    if not binary or len(binary) > MAX_IMAGE_BYTES:
        raise ReverseImageError("Imagem vazia ou excede 2 MB.")
    signatures = {
        "image/jpeg": binary.startswith(b"\xff\xd8\xff"),
        "image/png": binary.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": len(binary) >= 12 and binary[:4] == b"RIFF" and binary[8:12] == b"WEBP",
    }
    if not signatures[mime_type]:
        raise ReverseImageError("O conteúdo do arquivo não corresponde ao formato declarado.")
    return binary


def _safe_url(raw: object) -> str | None:
    if not isinstance(raw, str) or len(raw) > 1800:
        return None
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return None
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    return raw


def _summarize(web_detection: dict) -> dict:
    def urls(key: str, limit: int = 12):
        candidates = web_detection.get(key) or []
        output = []
        for entry in candidates[:100]:
            if not isinstance(entry, dict):
                continue
            value = _safe_url(entry.get("url"))
            if value and value not in output:
                output.append(value)
                if len(output) >= limit:
                    break
        return output

    entities = []
    for item in (web_detection.get("webEntities") or [])[:30]:
        if not isinstance(item, dict):
            continue
        label = item.get("description")
        if isinstance(label, str) and label.strip():
            entities.append({"description": label[:160], "score": round(float(item.get("score") or 0), 3)})
    return {
        "pages_with_matching_images": urls("pagesWithMatchingImages"),
        "full_matching_images": urls("fullMatchingImages"),
        "partial_matching_images": urls("partialMatchingImages"),
        "visually_similar_images": urls("visuallySimilarImages"),
        "web_entities": entities[:12],
    }


def search(encoded: str, mime_type: str, *, client: httpx.Client | None = None) -> dict:
    """Do not call before verifying a separate server-side admin authorization."""
    if not availability()["configured"]:
        raise ReverseImageError("Provedor reverso não configurado.")
    _validate_image(encoded, mime_type)
    key = os.environ["GOOGLE_CLOUD_VISION_API_KEY"]
    own_client = client is None
    if own_client:
        client = httpx.Client(timeout=httpx.Timeout(9), follow_redirects=False, trust_env=False)
    try:
        response = client.post(
            VISION_ENDPOINT,
            headers={"x-goog-api-key": key, "Content-Type": "application/json", "Accept": "application/json"},
            json={"requests": [{"image": {"content": encoded}, "features": [{"type": "WEB_DETECTION", "maxResults": 12}]}]},
        )
        if response.status_code != 200:
            raise ReverseImageError("Provedor externo recusou a consulta. Verifique cota, credenciais e disponibilidade.")
        if len(response.content) > MAX_RESPONSE_BYTES:
            raise ReverseImageError("Resposta externa excedeu o limite permitido.")
        body = response.json()
        data = (body.get("responses") or [{}])[0]
        if data.get("error"):
            raise ReverseImageError("Provedor retornou erro ao analisar a imagem.")
        result = _summarize(data.get("webDetection") or {})
        result.update({
            "provider": "Google Cloud Vision WEB_DETECTION", "source": VISION_ENDPOINT,
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "verified_identity": False,
            "notice": "Resultados do provedor, sujeitos a falsos positivos. A imagem foi transmitida externamente com consentimento explícito."
        })
        return result
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        raise ReverseImageError("Provedor externo indisponível ou tempo esgotado.") from exc
    except (TypeError, ValueError, IndexError, KeyError) as exc:
        if isinstance(exc, ReverseImageError):
            raise
        raise ReverseImageError("Resposta inválida recebida do provedor de imagens.") from exc
    finally:
        if own_client:
            client.close()
