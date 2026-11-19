"""Segurança: hash de senha, tokens de uso único, sessões e limite de tentativas.

Estratégia de tokens (confirmação de e-mail, redefinição de senha, sessão):
- O valor real é gerado com `secrets.token_urlsafe` (aleatório criptográfico).
- No banco guardamos SOMENTE o SHA-256 do token. Se o banco vazar, os tokens não servem.
- Tokens de e-mail/senha têm validade curta e campo `used_at` (uso único).
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, Request

from lib.db import db

SESSION_COOKIE = "mc_session"
SESSION_DAYS = 7
VERIFY_HOURS = 24
RESET_MINUTES = 60


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    """Motor devolve datetimes 'naive' (sem fuso); normalizamos para UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


# Hash fixo para comparar quando o e-mail não existe: o tempo de resposta fica parecido
# e não revela se a conta existe (evita enumeração por tempo).
_DUMMY_HASH = hash_password("dummy-password-0")


def dummy_verify() -> None:
    verify_password("x", _DUMMY_HASH)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}"


async def issue_token(user_id: str, kind: str, email: str) -> str:
    """Cria token de uso único. Invalida tokens anteriores do mesmo tipo para o usuário."""
    raw = secrets.token_urlsafe(32)
    ttl = timedelta(hours=VERIFY_HOURS) if kind == "verify_email" else timedelta(minutes=RESET_MINUTES)
    await db.tokens.update_many(
        {"user_id": user_id, "kind": kind, "used_at": None}, {"$set": {"used_at": now_utc(), "revoked": True}}
    )
    await db.tokens.insert_one({
        "id": str(uuid.uuid4()), "user_id": user_id, "kind": kind, "email": email,
        "token_hash": sha256(raw), "created_at": now_utc(),
        "expires_at": now_utc() + ttl, "used_at": None,
    })
    return raw


async def consume_token(raw: str, kind: str) -> dict:
    """Valida e marca como usado de forma atômica (impede reutilização em corrida)."""
    doc = await db.tokens.find_one_and_update(
        {"token_hash": sha256(raw), "kind": kind, "used_at": None, "expires_at": {"$gt": now_utc()}},
        {"$set": {"used_at": now_utc()}},
    )
    if not doc:
        raise HTTPException(status_code=400, detail="Link inválido, expirado ou já utilizado.")
    return doc


async def create_session(user_id: str, request: Request) -> str:
    raw = secrets.token_urlsafe(32)
    await db.sessions.insert_one({
        "token_hash": sha256(raw), "user_id": user_id, "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=SESSION_DAYS),
        "user_agent": (request.headers.get("user-agent") or "")[:200],
    })
    return raw


async def revoke_sessions(user_id: str, except_hash: str | None = None) -> None:
    query: dict = {"user_id": user_id}
    if except_hash:
        query["token_hash"] = {"$ne": except_hash}
    await db.sessions.delete_many(query)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?"))[:64]


async def rate_limit(name: str, ident: str, limit: int, window_seconds: int) -> None:
    """Janela fixa no Mongo (TTL limpa os registros). Estoura 429 quando passa do limite."""
    bucket = int(now_utc().timestamp()) // window_seconds
    key = f"{name}:{ident}:{bucket}"
    doc = await db.rate_limits.find_one_and_update(
        {"key": key},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now_utc() + timedelta(seconds=window_seconds)}},
        upsert=True, return_document=True,
    )
    if doc and doc["count"] > limit:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde alguns minutos e tente novamente.")
