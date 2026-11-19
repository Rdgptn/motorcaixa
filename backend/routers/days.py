"""Faturamento por dia (calendário). Um documento por (usuário, dia) — índice único impede duplicidade.

- Sem documento no dia  => "sem registro" (não sabemos se trabalhou).
- day_off=True ou total 0 => "folga / zero informado".
"""

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.deps import require_verified
from lib.finance import month_bounds
from lib.jobs import user_today
from lib.security import aware, now_utc
from models.schemas import DATE_RE, MONTH_RE, DayEntry, DayIn, DayOut, MessageOut, MonthDaysOut, _check_date

router = APIRouter(prefix="/days", tags=["days"])


def day_out(d: dict) -> DayOut:
    return DayOut(date=d["date"], day_off=d.get("day_off", False), km=d.get("km"), notes=d.get("notes", ""),
                  entries=[DayEntry(**e) for e in d["entries"]], total_cents=d["total_cents"],
                  updated_at=aware(d["updated_at"]))


@router.get("", response_model=MonthDaysOut)
async def list_month(month: str | None = None, user: dict = Depends(require_verified)):
    # Sem mês informado, usamos o mês atual no fuso do usuário (o "hoje" é do servidor).
    month = month or user_today(user)[:7]
    if not MONTH_RE.match(month):
        raise HTTPException(status_code=422, detail="Mês inválido (AAAA-MM).")
    start, end = month_bounds(month)
    q = {"user_id": user["id"], "date": {"$gte": start, "$lte": end}}
    days = await db.days.find(q, {"_id": 0}).sort("date", 1).to_list(40)
    exp: dict[str, int] = {}
    async for e in db.expenses.find(q, {"_id": 0, "date": 1, "amount_cents": 1}):
        exp[e["date"]] = exp.get(e["date"], 0) + e["amount_cents"]
    return MonthDaysOut(month=month, today=user_today(user), days=[day_out(d) for d in days], expense_by_day=exp)


@router.put("/{date}", response_model=DayOut)
async def save_day(date: str, body: DayIn, user: dict = Depends(require_verified)):
    try:
        _check_date(date)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if date > user_today(user):
        raise HTTPException(status_code=422, detail="Não é possível lançar faturamento em data futura.")
    sources = {s["id"]: s["name"] for s in user["income_sources"]}
    entries, seen = [], set()
    for en in body.entries:
        if en.source_id not in sources:
            raise HTTPException(status_code=422, detail="Fonte de renda inválida.")
        if en.source_id in seen:
            raise HTTPException(status_code=422, detail="Fonte repetida no mesmo dia.")
        seen.add(en.source_id)
        if body.day_off or en.amount_cents == 0:
            continue
        entries.append({"source_id": en.source_id, "source_name": sources[en.source_id], "amount_cents": en.amount_cents})
    doc = {"user_id": user["id"], "date": date, "day_off": body.day_off and not entries, "km": body.km,
           "notes": body.notes.strip(), "entries": entries, "total_cents": sum(e["amount_cents"] for e in entries),
           "updated_at": now_utc()}
    # upsert por (user_id, date): editar o dia substitui, nunca duplica.
    await db.days.update_one({"user_id": user["id"], "date": date}, {"$set": doc}, upsert=True)
    return day_out(doc)


@router.delete("/{date}", response_model=MessageOut)
async def delete_day(date: str, user: dict = Depends(require_verified)):
    if not DATE_RE.match(date):
        raise HTTPException(status_code=422, detail="Data inválida.")
    res = await db.days.delete_one({"user_id": user["id"], "date": date})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Nenhum lançamento neste dia.")
    return MessageOut(message="Lançamentos do dia excluídos.")
