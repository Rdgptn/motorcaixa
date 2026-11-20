"""Cálculos financeiros. TODAS as funções recebem `user_id` e filtram por ele.

Fórmulas (documentadas também no README):
- Faturamento do período  = soma dos valores informados por fonte nos dias do período.
- Despesas do período     = soma das despesas cuja data está no período.
- Resultado operacional   = faturamento - despesas (NÃO é lucro contábil/fiscal).
- Dia "trabalhado"        = dia com registro e total > 0.
- Dia "folga"             = dia com registro marcado como folga OU total informado = 0.
- Dia "sem registro"      = dia passado sem nenhum registro (não presumimos folga).
- Custo por km            = despesas / km informados (só quando houver km).
"""

import calendar
from datetime import date, timedelta

from lib.database import db
from models.schemas import DailyPoint, NamedTotal, PeriodSummary

MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
               "setembro", "outubro", "novembro", "dezembro"]


def month_bounds(month: str) -> tuple[str, str]:
    y, m = int(month[:4]), int(month[5:7])
    return f"{month}-01", f"{month}-{calendar.monthrange(y, m)[1]:02d}"


def prev_month(month: str) -> str:
    y, m = int(month[:4]), int(month[5:7])
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


def month_label(month: str) -> str:
    return f"{MONTH_NAMES[int(month[5:7]) - 1]} de {month[:4]}"


def _date_range(start: str, end: str):
    d, last = date.fromisoformat(start), date.fromisoformat(end)
    while d <= last:
        yield d.isoformat()
        d += timedelta(days=1)


async def fetch_days(user_id: str, start: str, end: str) -> list[dict]:
    return await db.days.find({"user_id": user_id, "date": {"$gte": start, "$lte": end}},
                              {"_id": 0}).sort("date", 1).to_list(1000)


async def fetch_expenses(user_id: str, start: str, end: str) -> list[dict]:
    return await db.expenses.find({"user_id": user_id, "date": {"$gte": start, "$lte": end}},
                                  {"_id": 0}).sort("date", 1).to_list(5000)


def _sorted_totals(d: dict[str, int]) -> list[NamedTotal]:
    return [NamedTotal(name=k, cents=v) for k, v in sorted(d.items(), key=lambda kv: -kv[1])]


async def period_summary(user_id: str, start: str, end: str, today: str) -> PeriodSummary:
    days = await fetch_days(user_id, start, end)
    expenses = await fetch_expenses(user_id, start, end)
    day_map = {d["date"]: d for d in days}
    exp_by_day: dict[str, int] = {}
    by_category: dict[str, int] = {}
    for e in expenses:
        exp_by_day[e["date"]] = exp_by_day.get(e["date"], 0) + e["amount_cents"]
        by_category[e["category_name"]] = by_category.get(e["category_name"], 0) + e["amount_cents"]

    by_source: dict[str, int] = {}
    daily: list[DailyPoint] = []
    worked = off = no_record = 0
    km_total = 0.0
    for iso in _date_range(start, end):
        d = day_map.get(iso)
        rev = 0
        if d:
            rev = d["total_cents"]
            km_total += d.get("km") or 0
            for en in d["entries"]:
                if en["amount_cents"] > 0:
                    by_source[en["source_name"]] = by_source.get(en["source_name"], 0) + en["amount_cents"]
            status = "folga" if d.get("day_off") or rev == 0 else "trabalhado"
        else:
            status = "futuro" if iso > today else "sem_registro"
        worked += status == "trabalhado"
        off += status == "folga"
        no_record += status == "sem_registro"
        daily.append(DailyPoint(date=iso, revenue_cents=rev, expense_cents=exp_by_day.get(iso, 0), status=status))

    revenue = sum(p.revenue_cents for p in daily)
    expense = sum(e["amount_cents"] for e in expenses)
    return PeriodSummary(
        start=start, end=end, revenue_cents=revenue, expense_cents=expense, result_cents=revenue - expense,
        by_source=_sorted_totals(by_source), by_category=_sorted_totals(by_category), daily=daily,
        worked_days=worked, off_days=off, no_record_days=no_record, km_total=round(km_total, 1),
        cost_per_km_cents=round(expense / km_total) if km_total > 0 else None,
        revenue_per_km_cents=round(revenue / km_total) if km_total > 0 else None,
    )
