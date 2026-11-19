"""Painel administrativo. Toda rota exige role == "admin" (verificado no servidor a cada requisição).
Ações administrativas ficam registradas em audit_logs."""

import re
import uuid
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from lib.db import db
from lib.deps import require_admin
from lib.finance import month_bounds, period_summary
from lib.jobs import process_monthly_batch, send_monthly_report, user_today
from lib.security import aware, now_utc, revoke_sessions
from lib.serializers import admin_row, run_out
from models.schemas import (AdminStats, AdminUserDetail, AdminUserPatch, AdminUserRow, AuditOut, ConfigIn,
                            EmailLogOut, MessageOut, PeriodIn, ReportRunOut)
from routers.me import get_config

router = APIRouter(prefix="/admin", tags=["admin"])


async def audit(actor: dict, action: str, target: str) -> None:
    await db.audit_logs.insert_one({"id": str(uuid.uuid4()), "actor_id": actor["id"], "actor_email": actor["email"],
                                    "action": action, "target": target, "created_at": now_utc()})


@router.get("/stats", response_model=AdminStats)
async def stats(admin: dict = Depends(require_admin)):
    u = db.users
    month = user_today(admin)[:7]
    start, end = month_bounds(month)
    rev = await db.days.aggregate([{"$match": {"date": {"$gte": start, "$lte": end}}},
                                   {"$group": {"_id": None, "t": {"$sum": "$total_cents"}}}]).to_list(1)
    return AdminStats(
        users_total=await u.count_documents({}),
        users_verified=await u.count_documents({"$expr": {"$eq": ["$verified_email", "$email"]}}),
        users_carro=await u.count_documents({"vehicle_type": "carro"}),
        users_moto=await u.count_documents({"vehicle_type": "moto"}),
        users_pro=await u.count_documents({"plan": "pro"}),
        users_disabled=await u.count_documents({"status": "disabled"}),
        days_recorded=await db.days.count_documents({}),
        expenses_recorded=await db.expenses.count_documents({}),
        revenue_month_cents=rev[0]["t"] if rev else 0,
        runs_sent=await db.report_runs.count_documents({"status": "sent"}),
        runs_failed=await db.report_runs.count_documents({"status": "failed"}),
        emails_failed_7d=await db.email_logs.count_documents({"status": "failed", "created_at": {"$gte": now_utc() - timedelta(days=7)}}),
    )


@router.get("/users", response_model=list[AdminUserRow])
async def users(q: str = "", admin: dict = Depends(require_admin)):
    query = {}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
        query = {"$or": [{"name": rx}, {"email": rx}]}
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return [admin_row(d) for d in docs]


async def _get_user(user_id: str) -> dict:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return u


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def user_detail(user_id: str, admin: dict = Depends(require_admin)):
    u = await _get_user(user_id)
    today = user_today(u)
    s = await period_summary(u["id"], *month_bounds(today[:7]), today)
    runs = await db.report_runs.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(12)
    await audit(admin, "view_user", u["email"])
    return AdminUserDetail(user=admin_row(u), month=today[:7], summary=s, runs=[run_out(r) for r in runs])


@router.patch("/users/{user_id}", response_model=AdminUserRow)
async def patch_user(user_id: str, body: AdminUserPatch, admin: dict = Depends(require_admin)):
    u = await _get_user(user_id)
    if user_id == admin["id"] and (body.status == "disabled" or body.role == "user"):
        raise HTTPException(status_code=422, detail="Você não pode remover seu próprio acesso de administrador.")
    upd: dict = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in ("status", "plan", "role")}
    if body.mark_email_verified:
        upd["verified_email"], upd["email_verified_at"] = u["email"], now_utc()
    if upd:
        await db.users.update_one({"id": user_id}, {"$set": upd})
        if upd.get("status") == "disabled":
            await revoke_sessions(user_id)
        await audit(admin, "update_user:" + ",".join(f"{k}={v}" for k, v in upd.items() if k != "email_verified_at"),
                    u["email"])
    return admin_row(await _get_user(user_id))


@router.post("/users/{user_id}/send-report", response_model=ReportRunOut)
async def admin_send(user_id: str, body: PeriodIn, admin: dict = Depends(require_admin)):
    u = await _get_user(user_id)
    run = await send_monthly_report(u["id"], body.period, "admin")
    await audit(admin, f"send_report:{body.period}", u["email"])
    return run_out(run, u["name"])


@router.post("/reports/run", response_model=MessageOut, status_code=202)
async def run_batch(body: PeriodIn, background: BackgroundTasks, admin: dict = Depends(require_admin)):
    background.add_task(process_monthly_batch, body.period)
    await audit(admin, f"run_batch:{body.period}", "all")
    return MessageOut(message=f"Processamento do lote {body.period} iniciado. Envios já realizados não se repetem.")


@router.get("/report-runs", response_model=list[ReportRunOut])
async def report_runs(admin: dict = Depends(require_admin)):
    docs = await db.report_runs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    names = {u["id"]: u["name"] async for u in db.users.find({"id": {"$in": [d["user_id"] for d in docs]}}, {"id": 1, "name": 1})}
    return [run_out(d, names.get(d["user_id"])) for d in docs]


@router.get("/email-logs", response_model=list[EmailLogOut])
async def email_logs(admin: dict = Depends(require_admin)):
    docs = await db.email_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [EmailLogOut(id=d["id"], kind=d["kind"], to_masked=d["to_masked"], status=d["status"],
                        error=d.get("error"), created_at=aware(d["created_at"])) for d in docs]


@router.get("/audit", response_model=list[AuditOut])
async def audit_logs(admin: dict = Depends(require_admin)):
    docs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [AuditOut(id=d["id"], actor_email=d["actor_email"], action=d["action"], target=d["target"],
                     created_at=aware(d["created_at"])) for d in docs]


@router.get("/config", response_model=ConfigIn)
async def read_config(admin: dict = Depends(require_admin)):
    return ConfigIn(**await get_config())


@router.put("/config", response_model=ConfigIn)
async def write_config(body: ConfigIn, admin: dict = Depends(require_admin)):
    await db.app_config.update_one({"id": "plans"}, {"$set": body.model_dump()}, upsert=True)
    await audit(admin, f"update_config:pro={body.pro_price_cents},trial={body.trial_days}", "plans")
    return body
