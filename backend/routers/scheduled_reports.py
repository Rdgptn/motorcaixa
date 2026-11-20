"""Relatórios automáticos e tarefas agendadas protegidos por Bearer e idempotência."""


import hmac
import os

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pymongo.errors import DuplicateKeyError

from lib.database import db
from lib.jobs import daily_job
from lib.security import now_utc

router = APIRouter(prefix="/cron", tags=["cron"])


def _authorized(request: Request) -> bool:
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("authorization", "")
    if not secret or not auth.startswith("Bearer "):
        return False
    return hmac.compare_digest(auth[7:].encode(), secret.encode())


@router.post("/daily", status_code=202)
async def cron_daily(request: Request, background: BackgroundTasks) -> dict:
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    if not _authorized(request):
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        envelope = await request.json()
    except Exception:
        envelope = {}
    if envelope is not None and not isinstance(envelope, dict):
        raise HTTPException(status_code=400, detail="invalid body")
    run_id = request.headers.get("x-webhook-id") or (envelope or {}).get("run_id") or now_utc().strftime("manual-%Y%m%d%H%M%S")
    try:
        await db.cron_runs.insert_one({"run_id": run_id, "name": "daily", "received_at": now_utc()})
    except DuplicateKeyError:
        return {"status": "duplicate"}
    background.add_task(daily_job)
    return {"status": "accepted"}
