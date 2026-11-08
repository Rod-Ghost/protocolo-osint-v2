"""GitHub OAuth for the hosted OSINT operator (independent from local FastAPI).

Authorization-code + PKCE, state cookie, signed short-lived session, and CSRF.
No GitHub API token or Vercel admin key is stored in the browser or a database.
All endpoints fail closed until configured in Vercel production environment.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse

SESSION_COOKIE = "__Host-osint-operator"
STATE_COOKIE = "__Host-osint-oauth"
SESSION_TTL = 8 * 3600
STATE_TTL = 600


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _settings() -> dict | None:
    values = {
        "client_id": os.getenv("OSINT_GITHUB_CLIENT_ID", "").strip(),
        "client_secret": os.getenv("OSINT_GITHUB_CLIENT_SECRET", "").strip(),
        "session_key": os.getenv("OSINT_SESSION_KEY", ""),
        "origin": os.getenv("OSINT_PUBLIC_ORIGIN", "").strip().rstrip("/"),
        "allowed": os.getenv("OSINT_ALLOWED_GITHUB_IDS", "").strip(),
    }
    try:
        url = urlsplit(values["origin"])
        allowed_ids = {int(x.strip()) for x in values["allowed"].split(",") if x.strip()}
    except (ValueError, TypeError):
        return None
    if (
        not values["client_id"] or not values["client_secret"]
        or len(values["session_key"]) < 32 or not allowed_ids
        or url.scheme != "https" or not url.hostname
        or url.username or url.password or url.path or url.query or url.fragment
    ):
        return None
    values["allowed_ids"] = allowed_ids
    return values


def _sign(payload: dict, key: str) -> str:
    message = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    tag = _b64(hmac.new(key.encode(), message.encode(), hashlib.sha256).digest())
    return message + "." + tag


def _verify(raw: str | None, key: str) -> dict | None:
    if not raw or not 10 <= len(raw) <= 4000:
        return None
    try:
        message, tag = raw.split(".", 1)
        expected = _b64(hmac.new(key.encode(), message.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(tag, expected):
            return None
        data = json.loads(_unb64(message))
        if not isinstance(data, dict) or not isinstance(data.get("exp"), int):
            return None
        if data["exp"] <= int(time.time()):
            return None
        return data
    except (ValueError, TypeError, UnicodeError):
        return None


def _origin_matches(request: Request, settings: dict) -> bool:
    return request.url.hostname == urlsplit(settings["origin"]).hostname


def status(request: Request) -> dict:
    settings = _settings()
    if not settings:
        return {"configured": False, "authenticated": False, "provider": "github",
                "notice": "Acesso a motores hospedados disponível apenas depois de configuração administrativa."}
    session = _verify(request.cookies.get(SESSION_COOKIE), settings["session_key"])
    valid = bool(session and session.get("type") == "session"
                 and session.get("uid") in settings["allowed_ids"]
                 and isinstance(session.get("csrf"), str))
    return {"configured": True, "authenticated": valid, "provider": "github",
            "username": str(session.get("login", ""))[:40] if valid else None,
            "csrf": session["csrf"] if valid else None}


def require_operator(request: Request, *, csrf: bool = False) -> dict:
    settings = _settings()
    if settings is None:
        raise HTTPException(503, "Login do operador ainda não configurado.")
    if not _origin_matches(request, settings):
        raise HTTPException(403, "Host não autorizado.")
    session = _verify(request.cookies.get(SESSION_COOKIE), settings["session_key"])
    if not session or session.get("type") != "session" or session.get("uid") not in settings["allowed_ids"]:
        raise HTTPException(401, "Entre com GitHub para executar motores hospedados.")
    if csrf:
        origin = request.headers.get("origin", "")
        if origin != settings["origin"]:
            raise HTTPException(403, "Origem da ação não autorizada.")
        sent = request.headers.get("x-osint-csrf", "")
        received = session.get("csrf", "")
        if not sent or not isinstance(received, str) or not hmac.compare_digest(sent, received):
            raise HTTPException(403, "Token antirrequisição inválido.")
    return session


def login(request: Request) -> RedirectResponse:
    settings = _settings()
    if settings is None:
        raise HTTPException(503, "Login GitHub não configurado na Vercel.")
    if not _origin_matches(request, settings):
        raise HTTPException(403, "Host não autorizado.")
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    challenge = _b64(hashlib.sha256(verifier.encode()).digest())
    callback = settings["origin"] + "/api/v1/auth/github/callback"
    target = "https://github.com/login/oauth/authorize?" + urlencode({
        "client_id": settings["client_id"], "redirect_uri": callback,
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
        "allow_signup": "false",
    })
    response = RedirectResponse(target, status_code=302)
    response.set_cookie(
        STATE_COOKIE, _sign({"type": "oauth", "state": state, "verifier": verifier,
                             "exp": int(time.time()) + STATE_TTL}, settings["session_key"]),
        max_age=STATE_TTL, secure=True, httponly=True, samesite="lax", path="/"
    )
    response.headers["Cache-Control"] = "no-store"
    return response


async def _github_identity(settings: dict, code: str, verifier: str) -> tuple[int, str]:
    callback = settings["origin"] + "/api/v1/auth/github/callback"
    async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={"client_id": settings["client_id"], "client_secret": settings["client_secret"],
                  "code": code, "code_verifier": verifier, "redirect_uri": callback},
        )
        response.raise_for_status()
        payload = response.json()
        token = payload.get("access_token", "")
        if not isinstance(token, str) or not 10 <= len(token) <= 3000 or payload.get("token_type", "").lower() != "bearer":
            raise ValueError("Falha ao autenticar via GitHub.")
        response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28"},
        )
        response.raise_for_status()
        identity = response.json()
    uid = identity.get("id")
    name = identity.get("login")
    if not isinstance(uid, int) or not isinstance(name, str) or not name:
        raise ValueError("GitHub não forneceu identidade válida.")
    return uid, name


async def callback(request: Request, *, code: str, state: str) -> RedirectResponse:
    settings = _settings()
    if settings is None or not _origin_matches(request, settings):
        raise HTTPException(503, "Login não configurado.")
    stored = _verify(request.cookies.get(STATE_COOKIE), settings["session_key"])
    if (not stored or stored.get("type") != "oauth" or
        not isinstance(state, str) or
        not hmac.compare_digest(state, stored.get("state", "")) or
        not isinstance(code, str) or not 5 <= len(code) <= 300):
        raise HTTPException(403, "Fluxo GitHub inválido ou expirado.")
    try:
        uid, login_name = await _github_identity(settings, code, stored["verifier"])
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(502, "Não foi possível validar a identidade no GitHub.") from exc
    if uid not in settings["allowed_ids"]:
        raise HTTPException(403, "Conta GitHub sem autorização para operar os motores.")
    token = _sign({"type": "session", "uid": uid, "login": login_name,
                   "csrf": secrets.token_urlsafe(24), "exp": int(time.time()) + SESSION_TTL},
                  settings["session_key"])
    response = RedirectResponse(settings["origin"] + "/#engines", status_code=303)
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_TTL,
                        httponly=True, secure=True, samesite="lax", path="/")
    response.delete_cookie(STATE_COOKIE, secure=True, httponly=True, samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


def logout(request: Request) -> RedirectResponse:
    require_operator(request, csrf=True)
    settings = _settings()
    response = RedirectResponse(settings["origin"] + "/#engines", status_code=303)
    response.delete_cookie(SESSION_COOKIE, secure=True, httponly=True, samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    return response
