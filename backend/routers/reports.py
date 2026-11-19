"""Dashboard e relatórios (resumo por período, CSV, XLSX e reenvio manual do relatório)."""

import csv
import io
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse

from lib.db import db
from lib.deps import require_verified
from lib.finance import fetch_days, fetch_expenses, month_bounds, prev_month, period_summary
from lib.jobs import send_monthly_report, user_today
from lib.security import now_utc, rate_limit
from lib.serializers import run_out
from lib.xlsx_report import build_month_xlsx
from models.schemas import (DATE_RE, Alert, DashboardOut, PeriodIn, PeriodSummary, ReportRunOut,
                            SummaryCompareOut)

router = APIRouter(tags=["reports"])


def _brl(cents: int) -> str:
    s = f"{abs(cents) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{'-' if cents < 0 else ''}R$ {s}"


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(user: dict = Depends(require_verified)):
    today = user_today(user)
    month = today[:7]
    cur = await period_summary(user["id"], *month_bounds(month), today)
    prev = await period_summary(user["id"], *month_bounds(prev_month(month)), today)
    today_point = next(p for p in cur.daily if p.date == today)

    alerts: list[Alert] = []
    week_ago = (date.fromisoformat(today) - timedelta(days=7)).isoformat()
    yesterday = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
    recent = {d["date"] for d in await fetch_days(user["id"], week_ago, yesterday)}
    missing = 7 - len(recent)
    if missing > 0:
        alerts.append(Alert(kind="warning", text=f"{missing} dia(s) sem registro nos últimos 7 dias. "
                                                 "Se foi folga, marque no calendário."))
    day = int(today[8:])
    async for r in db.recurring.find({"user_id": user["id"], "active": True}, {"_id": 0}):
        if r.get("last_generated_month") != month and 0 <= r["day_of_month"] - day <= 5:
            alerts.append(Alert(kind="info", text=f"Despesa recorrente '{r['description']}' vence dia "
                                                  f"{r['day_of_month']:02d} ({_brl(r['amount_cents'])})."))
    gen = await db.expenses.count_documents({"user_id": user["id"], "auto_generated": True,
                                             "created_at": {"$gte": now_utc() - timedelta(days=7)}})
    if gen:
        alerts.append(Alert(kind="success", text=f"{gen} despesa(s) recorrente(s) gerada(s) automaticamente "
                                                 "nos últimos 7 dias. Confira em Despesas."))
    return DashboardOut(today=today, month=month, today_revenue_cents=today_point.revenue_cents,
                        today_expense_cents=today_point.expense_cents, current=cur, previous=prev, alerts=alerts)


def _check_period(start: str, end: str) -> None:
    if not (DATE_RE.match(start) and DATE_RE.match(end)) or start > end:
        raise HTTPException(status_code=422, detail="Período inválido.")
    if (date.fromisoformat(end) - date.fromisoformat(start)).days > 366:
        raise HTTPException(status_code=422, detail="Período máximo de 1 ano.")


@router.get("/reports/summary", response_model=SummaryCompareOut)
async def summary(start: str, end: str, user: dict = Depends(require_verified)):
    _check_period(start, end)
    today = user_today(user)
    cur = await period_summary(user["id"], start, end, today)
    span = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    p_end = date.fromisoformat(start) - timedelta(days=1)
    p_start = p_end - timedelta(days=span - 1)
    prev = await period_summary(user["id"], p_start.isoformat(), p_end.isoformat(), today)
    return SummaryCompareOut(current=cur, previous=prev)


@router.get("/reports/csv")
async def export_csv(start: str, end: str, user: dict = Depends(require_verified)):
    _check_period(start, end)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")  # ";" abre corretamente no Excel em português
    w.writerow(["tipo", "data", "fonte_ou_categoria", "descricao", "valor"])
    for d in await fetch_days(user["id"], start, end):
        if not d["entries"]:
            w.writerow(["folga", d["date"], "", "Folga / zero informado", "0,00"])
        for e in d["entries"]:
            w.writerow(["faturamento", d["date"], e["source_name"], "", f"{e['amount_cents'] / 100:.2f}".replace(".", ",")])
    for e in await fetch_expenses(user["id"], start, end):
        w.writerow(["despesa", e["date"], e["category_name"], e["description"],
                    f"{e['amount_cents'] / 100:.2f}".replace(".", ",")])
    data = "\ufeff" + buf.getvalue()  # BOM para acentos no Excel
    return StreamingResponse(iter([data]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="lancamentos-{start}-a-{end}.csv"',
                                      "Cache-Control": "no-store"})


@router.get("/reports/xlsx/{period}")
async def download_xlsx(period: str, user: dict = Depends(require_verified)):
    PeriodIn(period=period)
    content, _ = await build_month_xlsx(user, period, user_today(user))
    return Response(content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="relatorio-{period}.xlsx"',
                             "Cache-Control": "no-store"})


@router.get("/reports/runs", response_model=list[ReportRunOut])
async def my_runs(user: dict = Depends(require_verified)):
    docs = await db.report_runs.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(24)
    return [run_out(d) for d in docs]


@router.post("/reports/send", response_model=ReportRunOut)
async def resend(body: PeriodIn, user: dict = Depends(require_verified)):
    """Reenvio manual pelo próprio usuário — sempre para o e-mail confirmado dele."""
    if body.period > user_today(user)[:7]:
        raise HTTPException(status_code=422, detail="Período futuro.")
    await rate_limit("report_send", user["id"], 3, 3600)
    run = await send_monthly_report(user["id"], body.period, "manual")
    return run_out(run)


_ = PeriodSummary
