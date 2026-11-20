"""Despesas e regras de despesas recorrentes. Todas as consultas filtram por user_id do servidor.
Registro de outro usuário => 404 (não revelamos que existe)."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.database import db
from lib.auth_dependencies import require_verified
from lib.jobs import generate_recurring_for_user
from lib.security import now_utc
from lib.response_serializers import expense_out, recurring_out
from models.schemas import (DATE_RE, ExpenseIn, ExpenseOut, GenerateOut, MessageOut, RecurringIn,
                            RecurringOut)

router = APIRouter(tags=["expenses"])


def _category(user: dict, category_id: str) -> str:
    for c in user["expense_categories"]:
        if c["id"] == category_id:
            return c["name"]
    raise HTTPException(status_code=422, detail="Categoria inválida.")


@router.get("/expenses", response_model=list[ExpenseOut])
async def list_expenses(start: str, end: str, category_id: Optional[str] = None,
                        user: dict = Depends(require_verified)):
    if not (DATE_RE.match(start) and DATE_RE.match(end)) or start > end:
        raise HTTPException(status_code=422, detail="Período inválido.")
    q: dict = {"user_id": user["id"], "date": {"$gte": start, "$lte": end}}
    if category_id:
        q["category_id"] = category_id
    docs = await db.expenses.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(2000)
    return [expense_out(d) for d in docs]


@router.post("/expenses", response_model=ExpenseOut, status_code=201)
async def create_expense(body: ExpenseIn, user: dict = Depends(require_verified)):
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **body.model_dump(),
           "description": body.description.strip(), "category_name": _category(user, body.category_id),
           "recurring_id": None, "created_at": now_utc()}
    await db.expenses.insert_one(doc)
    return expense_out(doc)


@router.put("/expenses/{expense_id}", response_model=ExpenseOut)
async def update_expense(expense_id: str, body: ExpenseIn, user: dict = Depends(require_verified)):
    upd = {**body.model_dump(), "description": body.description.strip(),
           "category_name": _category(user, body.category_id), "updated_at": now_utc()}
    doc = await db.expenses.find_one_and_update({"id": expense_id, "user_id": user["id"]}, {"$set": upd},
                                                projection={"_id": 0}, return_document=True)
    if not doc:
        raise HTTPException(status_code=404, detail="Despesa não encontrada.")
    return expense_out(doc)


@router.delete("/expenses/{expense_id}", response_model=MessageOut)
async def delete_expense(expense_id: str, user: dict = Depends(require_verified)):
    res = await db.expenses.delete_one({"id": expense_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Despesa não encontrada.")
    return MessageOut(message="Despesa excluída.")


# ---------- Recorrentes ----------
@router.get("/recurring", response_model=list[RecurringOut])
async def list_recurring(user: dict = Depends(require_verified)):
    docs = await db.recurring.find({"user_id": user["id"]}, {"_id": 0}).sort("day_of_month", 1).to_list(200)
    return [recurring_out(d) for d in docs]


@router.post("/recurring", response_model=RecurringOut, status_code=201)
async def create_recurring(body: RecurringIn, user: dict = Depends(require_verified)):
    if await db.recurring.count_documents({"user_id": user["id"]}) >= 50:
        raise HTTPException(status_code=422, detail="Limite de 50 despesas recorrentes.")
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **body.model_dump(),
           "description": body.description.strip(), "category_name": _category(user, body.category_id),
           "last_generated_month": None, "created_at": now_utc()}
    await db.recurring.insert_one(doc)
    return recurring_out(doc)


@router.put("/recurring/{rule_id}", response_model=RecurringOut)
async def update_recurring(rule_id: str, body: RecurringIn, user: dict = Depends(require_verified)):
    upd = {**body.model_dump(), "description": body.description.strip(),
           "category_name": _category(user, body.category_id)}
    doc = await db.recurring.find_one_and_update({"id": rule_id, "user_id": user["id"]}, {"$set": upd},
                                                 projection={"_id": 0}, return_document=True)
    if not doc:
        raise HTTPException(status_code=404, detail="Regra não encontrada.")
    return recurring_out(doc)


@router.delete("/recurring/{rule_id}", response_model=MessageOut)
async def delete_recurring(rule_id: str, user: dict = Depends(require_verified)):
    # Excluir a regra NÃO apaga despesas já geradas (histórico preservado).
    res = await db.recurring.delete_one({"id": rule_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Regra não encontrada.")
    return MessageOut(message="Regra excluída. Despesas já geradas foram mantidas.")


@router.post("/recurring/generate", response_model=GenerateOut)
async def generate_now(user: dict = Depends(require_verified)):
    generated, skipped = await generate_recurring_for_user(user)
    return GenerateOut(generated=[expense_out(g) for g in generated], skipped_already_launched=skipped)
