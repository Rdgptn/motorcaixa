"""Dependências de autenticação/autorização usadas pelas rotas.

Regra de ouro do isolamento: o usuário é identificado SEMPRE pelo cookie de sessão
(validado no servidor). Nenhuma rota aceita `user_id` vindo do navegador para dados
financeiros; todas as consultas usam `user["id"]` obtido aqui.
"""

from fastapi import Depends, HTTPException, Request

from lib.db import db
from lib.security import SESSION_COOKIE, now_utc, sha256


async def get_current_user(request: Request) -> dict:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        raise HTTPException(status_code=401, detail="Sessão ausente. Faça login.")
    session = await db.sessions.find_one({"token_hash": sha256(raw), "expires_at": {"$gt": now_utc()}})
    if not session:
        raise HTTPException(status_code=401, detail="Sessão expirada. Faça login novamente.")
    # Relemos o usuário a cada requisição: se o admin desativar a conta ou mudar o papel,
    # o efeito é imediato (não depende de dados "congelados" em um token).
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
    if not user or user.get("status") != "active":
        raise HTTPException(status_code=401, detail="Conta indisponível.")
    user["_session_hash"] = session["token_hash"]
    return user


def is_verified(user: dict) -> bool:
    """E-mail confirmado = o endereço ATUAL é o mesmo que foi confirmado pelo link."""
    return bool(user.get("verified_email")) and user.get("verified_email") == user.get("email")


async def require_verified(user: dict = Depends(get_current_user)) -> dict:
    if not is_verified(user):
        raise HTTPException(status_code=403, detail="Confirme seu e-mail para usar esta função.")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador.")
    return user
