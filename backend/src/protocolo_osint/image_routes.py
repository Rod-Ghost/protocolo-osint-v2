"""Hosted image-reverse routes. Public config, operator-authenticated execution.

Does not expose the internal Vision credential, store images or create jobs.
"""
from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .reverse_image import ReverseImageError, availability, search

router = APIRouter()


class ReverseRequest(BaseModel):
    mime_type: str = Field(max_length=32)
    content_base64: str = Field(min_length=1, max_length=2_666_672)


@router.get('/api/v1/images/reverse/config')
def reverse_provider_config():
    return availability()


@router.post('/api/v1/images/reverse')
def reverse_image(payload: ReverseRequest, authorization: str | None = Header(default=None)):
    if not availability()['configured']:
        raise HTTPException(503, 'Busca reversa externa ainda não configurada. Nenhuma imagem foi enviada.')
    secret = os.getenv('OSINT_REVERSE_TOKEN', '')
    candidate = (authorization or '').removeprefix('Bearer ')
    if not authorization or not authorization.startswith('Bearer ') or not hmac.compare_digest(candidate, secret):
        raise HTTPException(401, 'Credencial de pesquisa externa inválida.')
    try:
        return search(payload.content_base64, payload.mime_type)
    except ReverseImageError as exc:
        message = str(exc)
        status = 422 if any(term in message.lower() for term in ('formato','limite','vazia','conteúdo','corresponde')) else 502
        raise HTTPException(status, message) from exc
