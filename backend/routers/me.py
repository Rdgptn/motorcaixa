"""Perfil e ajustes do próprio usuário (fontes de renda, categorias, preferências, e-mail, senha)."""

import uuid
from zoneinfo import available_timezones

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.defaults import DEFAULT_CONFIG, PLAN_FEATURES, default_categories, default_sources, merge_defaults
from lib.deps import get_current_user
from lib.security import hash_password, now_utc, rate_limit, revoke_sessions, verify_password
from lib.serializers import user_out
from models.schemas import (ChangeEmailIn, ChangePasswordIn, MessageOut, NamedListIn, PlanInfo, PlansOut,
                            ProfilePatch, UserOut)
from routers.auth import send_verification

router = APIRouter(prefix="/me", tags=["me"])
_TZS = available_timezones()


@router.patch("", response_model=UserOut)
async def update_profile(body: ProfilePatch, user: dict = Depends(get_current_user)):
    # Lista branca: só estes campos podem ser alterados pelo usuário.
    upd = body.model_dump(exclude_none=True)
    if "timezone" in upd and upd["timezone"] not in _TZS:
        raise HTTPException(status_code=422, detail="Fuso horário inválido.")
    if "name" in upd:
        upd["name"] = upd["name"].strip()
    if upd.get("vehicle_type") and upd["vehicle_type"] != user["vehicle_type"]:
        upd["income_sources"] = merge_defaults(user["income_sources"], default_sources(upd["vehicle_type"]))
        upd["expense_categories"] = merge_defaults(user["expense_categories"], default_categories(upd["vehicle_type"]))
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return user_out(await db.users.find_one({"id": user["id"]}, {"_id": 0}))


def _merge_list(current: list[dict], body: NamedListIn) -> list[dict]:
    """Mantém ids existentes (lançamentos antigos continuam ligados), cria ids para novos itens.
    Itens padrão (builtin) não podem ser removidos, só desativados."""
    by_id = {c["id"]: c for c in current}
    out, seen_names = [], set()
    for it in body.items:
        name = it.name.strip()
        if name.lower() in seen_names:
            raise HTTPException(status_code=422, detail=f"Nome repetido: {name}")
        seen_names.add(name.lower())
        if it.id and it.id in by_id:
            base = by_id[it.id]
            out.append({**base, "name": name if not base.get("builtin") else base["name"], "active": it.active})
        else:
            out.append({"id": f"c-{uuid.uuid4().hex[:10]}", "name": name, "active": it.active, "builtin": False})
    kept = {o["id"] for o in out}
    out += [{**c, "active": False} for c in current if c.get("builtin") and c["id"] not in kept]
    if not any(o["active"] for o in out):
        raise HTTPException(status_code=422, detail="Mantenha pelo menos um item ativo.")
    return out


@router.put("/sources", response_model=UserOut)
async def update_sources(body: NamedListIn, user: dict = Depends(get_current_user)):
    items = _merge_list(user["income_sources"], body)
    await db.users.update_one({"id": user["id"]}, {"$set": {"income_sources": items}})
    return user_out({**user, "income_sources": items})


@router.put("/categories", response_model=UserOut)
async def update_categories(body: NamedListIn, user: dict = Depends(get_current_user)):
    items = _merge_list(user["expense_categories"], body)
    await db.users.update_one({"id": user["id"]}, {"$set": {"expense_categories": items}})
    return user_out({**user, "expense_categories": items})


@router.post("/email", response_model=MessageOut)
async def change_email(body: ChangeEmailIn, user: dict = Depends(get_current_user)):
    await rate_limit("change_email", user["id"], 5, 3600)
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Senha incorreta.")
    new = body.new_email.lower()
    if new == user["email"]:
        raise HTTPException(status_code=422, detail="Este já é o seu e-mail atual.")
    if await db.users.find_one({"email": new}):
        # Mensagem neutra: não confirma se o e-mail pertence a outra pessoa.
        raise HTTPException(status_code=400, detail="Não foi possível usar este e-mail. Tente outro.")
    # O e-mail novo fica pendente: relatórios não são enviados até a confirmação.
    await db.users.update_one({"id": user["id"]}, {"$set": {"email": new}})
    await send_verification({**user, "email": new})
    return MessageOut(message="E-mail atualizado. Enviamos um link de confirmação para o novo endereço.")


@router.post("/password", response_model=MessageOut)
async def change_password(body: ChangePasswordIn, user: dict = Depends(get_current_user)):
    await rate_limit("change_pw", user["id"], 5, 900)
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await revoke_sessions(user["id"], except_hash=user["_session_hash"])
    return MessageOut(message="Senha alterada. Outras sessões foram encerradas.")


async def get_config() -> dict:
    doc = await db.app_config.find_one({"id": "plans"}, {"_id": 0}) or {}
    return {**DEFAULT_CONFIG, **{k: v for k, v in doc.items() if k in DEFAULT_CONFIG}}


@router.get("/plans", response_model=PlansOut)
async def plans(user: dict = Depends(get_current_user)):
    cfg = await get_config()
    return PlansOut(
        plans=[PlanInfo(id="free", name="Gratuito", price_cents=0, trial_days=0, features=PLAN_FEATURES["free"]),
               PlanInfo(id="pro", name="Pro", price_cents=cfg["pro_price_cents"], trial_days=cfg["trial_days"],
                        features=PLAN_FEATURES["pro"])],
        current=user.get("plan", "free"), billing_enabled=False,
    )


_ = now_utc  # (mantém import para futuras auditorias)
