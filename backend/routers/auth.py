"""Rotas de autenticação: cadastro, login/logout, confirmação de e-mail e recuperação de senha.

Mensagens públicas são genéricas para não revelar se um e-mail já tem conta.
"""

import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.db import db
from lib.defaults import default_categories, default_sources
from lib.deps import get_current_user
from lib.mailer import (EmailError, account_exists_html, reset_password_html, send_email,
                        verify_email_html)
from lib.security import (SESSION_COOKIE, SESSION_DAYS, client_ip, consume_token, create_session,
                          dummy_verify, hash_password, issue_token, now_utc, rate_limit,
                          revoke_sessions, verify_password)
from lib.serializers import user_out
from models.schemas import (EmailIn, LoginIn, MessageOut, ResetPasswordIn, SignupIn, TokenIn,
                            UserOut)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
SIGNUP_MSG = "Se os dados forem válidos, enviaremos um link de confirmação para o e-mail informado."


async def send_verification(user: dict) -> None:
    token = await issue_token(user["id"], "verify_email", user["email"])
    subject, html = verify_email_html(user["name"], token)
    try:
        await send_email(kind="verify_email", to=user["email"], subject=subject, html=html, user_id=user["id"])
    except EmailError:
        pass  # já registrado em email_logs; o usuário pode reenviar depois
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_verification_sent_at": now_utc()}})


@router.post("/signup", response_model=MessageOut, status_code=202)
async def signup(body: SignupIn, request: Request):
    await rate_limit("signup", client_ip(request), 10, 3600)
    email = body.email.lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        # Não revelamos na resposta; avisamos o dono do e-mail.
        if existing.get("verified_email") == email:
            subject, html = account_exists_html(existing["name"])
            try:
                await send_email(kind="account_exists", to=email, subject=subject, html=html, user_id=existing["id"])
            except EmailError:
                pass
        else:
            await send_verification(existing)
        return MessageOut(message=SIGNUP_MSG)
    user = {
        "id": str(uuid.uuid4()), "name": body.name.strip(), "email": email,
        "password_hash": hash_password(body.password), "vehicle_type": body.vehicle_type,
        "verified_email": None, "email_verified_at": None, "role": "user", "plan": "free",
        "status": "active", "timezone": "America/Sao_Paulo", "report_opt_in": True, "report_attach": True,
        "is_demo": False, "income_sources": default_sources(body.vehicle_type),
        "expense_categories": default_categories(body.vehicle_type), "created_at": now_utc(),
        "last_login_at": None,
    }
    await db.users.insert_one(user)
    await send_verification(user)
    return MessageOut(message=SIGNUP_MSG)


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    await rate_limit("login_ip", client_ip(request), 30, 900)
    await rate_limit("login_email", email, 10, 900)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        dummy_verify()
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")
    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="Conta desativada. Fale com o suporte.")
    raw = await create_session(user["id"], request)
    response.set_cookie(SESSION_COOKIE, raw, max_age=SESSION_DAYS * 86400, httponly=True,
                        secure=COOKIE_SECURE, samesite="lax", path="/")
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now_utc()}})
    return user_out(user)


@router.post("/logout", response_model=MessageOut)
async def logout(request: Request, response: Response):
    raw = request.cookies.get(SESSION_COOKIE)
    if raw:
        from lib.security import sha256
        await db.sessions.delete_one({"token_hash": sha256(raw)})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return MessageOut(message="Sessão encerrada.")


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user_out(user)


@router.post("/verify-email", response_model=MessageOut)
async def verify_email(body: TokenIn, request: Request):
    await rate_limit("verify", client_ip(request), 30, 900)
    tok = await consume_token(body.token, "verify_email")
    user = await db.users.find_one({"id": tok["user_id"]}, {"_id": 0})
    # O token só vale para o endereço para o qual foi emitido.
    if not user or user["email"] != tok["email"]:
        raise HTTPException(status_code=400, detail="Link inválido, expirado ou já utilizado.")
    await db.users.update_one({"id": user["id"]}, {"$set": {"verified_email": user["email"], "email_verified_at": now_utc()}})
    return MessageOut(message="E-mail confirmado com sucesso! Você já pode usar todas as funções.")


@router.post("/resend-verification", response_model=MessageOut)
async def resend_verification(user: dict = Depends(get_current_user)):
    if user.get("verified_email") == user["email"]:
        return MessageOut(message="Seu e-mail já está confirmado.")
    await rate_limit("resend_min", user["id"], 1, 60)
    await rate_limit("resend_hour", user["id"], 5, 3600)
    await send_verification(user)
    return MessageOut(message="Enviamos um novo link de confirmação.")


@router.post("/forgot-password", response_model=MessageOut, status_code=202)
async def forgot_password(body: EmailIn, request: Request):
    email = body.email.lower()
    await rate_limit("forgot_ip", client_ip(request), 10, 3600)
    await rate_limit("forgot_email", email, 3, 3600)
    user = await db.users.find_one({"email": email, "status": "active"}, {"_id": 0})
    if user:
        token = await issue_token(user["id"], "reset_password", email)
        subject, html = reset_password_html(user["name"], token)
        try:
            await send_email(kind="reset_password", to=email, subject=subject, html=html, user_id=user["id"])
        except EmailError:
            pass
    return MessageOut(message="Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha.")


@router.post("/reset-password", response_model=MessageOut)
async def reset_password(body: ResetPasswordIn, request: Request):
    await rate_limit("reset", client_ip(request), 20, 900)
    tok = await consume_token(body.token, "reset_password")
    user = await db.users.find_one({"id": tok["user_id"]}, {"_id": 0})
    if not user or user["email"] != tok["email"]:
        raise HTTPException(status_code=400, detail="Link inválido, expirado ou já utilizado.")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await revoke_sessions(user["id"])  # derruba sessões antigas por segurança
    return MessageOut(message="Senha alterada. Entre com a nova senha.")
