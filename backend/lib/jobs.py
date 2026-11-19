"""Rotinas em lote: despesas recorrentes e relatório mensal por e-mail.

Idempotência do relatório automático: índice único (user_id, period, trigger_key="auto")
na coleção report_runs. Mesmo que o agendador dispare duas vezes, só um envio acontece.
Falhas temporárias ficam com status "failed" e são retentadas (até 3 tentativas) nas
execuções seguintes do agendador diário, que roda do dia 1 ao dia 5 de cada mês.
"""

import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from pymongo.errors import DuplicateKeyError

from lib.dates import today_iso
from lib.db import db
from lib.deps import is_verified
from lib.finance import month_label, prev_month
from lib.mailer import EmailError, monthly_report_html, send_email
from lib.security import mask_email, now_utc
from lib.xlsx_report import build_month_xlsx

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 3
VERIFIED_EXPR = {"$expr": {"$eq": ["$verified_email", "$email"]}}


def user_today(user: dict) -> str:
    try:
        return today_iso(user.get("timezone") or "America/Sao_Paulo")
    except Exception:
        return today_iso("America/Sao_Paulo")


# ---------------- Despesas recorrentes ----------------
async def generate_recurring_for_user(user: dict) -> tuple[list[dict], list[str]]:
    """Gera a ocorrência do mês atual para regras cujo dia de vencimento já chegou.

    Regras para não duplicar:
    1) índice único (user_id, recurring_id, competence) — a mesma regra nunca gera 2x no mês;
    2) se o usuário já lançou manualmente uma despesa com a mesma descrição e categoria no mês,
       a regra NÃO gera e o nome volta em `skipped` para avisarmos na tela.
    """
    today = user_today(user)
    month, day = today[:7], int(today[8:])
    generated, skipped = [], []
    rules = await db.recurring.find({"user_id": user["id"], "active": True}, {"_id": 0}).to_list(200)
    for rule in rules:
        if rule["day_of_month"] > day or rule.get("last_generated_month") == month:
            continue
        manual = await db.expenses.find_one({
            "user_id": user["id"], "recurring_id": None, "category_id": rule["category_id"],
            "date": {"$gte": f"{month}-01", "$lte": f"{month}-31"},
            "description": {"$regex": f"^{_re_escape(rule['description'])}$", "$options": "i"},
        })
        if manual:
            skipped.append(rule["description"])
            await db.recurring.update_one({"id": rule["id"]}, {"$set": {"last_generated_month": month}})
            continue
        doc = {
            "id": str(uuid.uuid4()), "user_id": user["id"], "date": f"{month}-{rule['day_of_month']:02d}",
            "category_id": rule["category_id"], "category_name": rule["category_name"],
            "description": rule["description"], "amount_cents": rule["amount_cents"], "kind": "mensal",
            "notes": rule.get("notes", ""), "recurring_id": rule["id"], "competence": month,
            "created_at": now_utc(), "auto_generated": True,
        }
        try:
            await db.expenses.insert_one(doc)
            doc.pop("_id", None)
            generated.append(doc)
        except DuplicateKeyError:
            pass
        await db.recurring.update_one({"id": rule["id"]}, {"$set": {"last_generated_month": month}})
    return generated, skipped


def _re_escape(s: str) -> str:
    import re
    return re.escape(s)


async def generate_recurring_all() -> int:
    count = 0
    user_ids = await db.recurring.distinct("user_id", {"active": True})
    async for user in db.users.find({"id": {"$in": user_ids}, "status": "active"}, {"_id": 0}):
        gen, _ = await generate_recurring_for_user(user)
        count += len(gen)
    return count


# ---------------- Relatório mensal ----------------
def default_report_period() -> str:
    return prev_month(today_iso("America/Sao_Paulo")[:7])


async def _claim_auto(user_id: str, period: str) -> dict | None:
    run = {"id": str(uuid.uuid4()), "user_id": user_id, "period": period, "trigger": "auto",
           "trigger_key": "auto", "status": "processing", "attempts": 1, "email_masked": "",
           "with_attachment": False, "error": None, "created_at": now_utc(), "finished_at": None}
    try:
        await db.report_runs.insert_one(run)
        return run
    except DuplicateKeyError:
        return await db.report_runs.find_one_and_update(
            {"user_id": user_id, "period": period, "trigger_key": "auto", "status": "failed",
             "retryable": True, "attempts": {"$lt": MAX_ATTEMPTS}},
            {"$set": {"status": "processing", "error": None}, "$inc": {"attempts": 1}},
            return_document=True,
        )


async def send_monthly_report(user_id: str, period: str, trigger: str) -> dict | None:
    """Gera e envia o relatório de UM usuário. Retorna o registro do processamento."""
    if trigger == "auto":
        run = await _claim_auto(user_id, period)
        if not run:
            return None  # já enviado/omitido ou tentativas esgotadas
    else:
        run = {"id": str(uuid.uuid4()), "user_id": user_id, "period": period, "trigger": trigger,
               "trigger_key": str(uuid.uuid4()), "status": "processing", "attempts": 1, "email_masked": "",
               "with_attachment": False, "error": None, "created_at": now_utc(), "finished_at": None}
        await db.report_runs.insert_one(run)

    async def finish(status: str, error: str | None = None, retryable: bool = False, **extra) -> dict:
        upd = {"status": status, "error": error, "retryable": retryable, "finished_at": now_utc(), **extra}
        await db.report_runs.update_one({"id": run["id"]}, {"$set": upd})
        run.update(upd)
        return run

    # Relemos o usuário AGORA: o destinatário é sempre o e-mail atual e confirmado.
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("status") != "active":
        return await finish("skipped", "conta_inativa")
    if not is_verified(user):
        return await finish("skipped", "email_nao_confirmado")
    if trigger == "auto" and not user.get("report_opt_in", True):
        return await finish("skipped", "envio_automatico_desativado")
    to = user["email"]
    try:
        xlsx, has_data = await build_month_xlsx(user, period, user_today(user))
        attach = has_data and user.get("report_attach", True)
        subject, html = monthly_report_html(user["name"], month_label(period), has_data, attach)
        filename = f"relatorio-{period}.xlsx"
        included = await send_email(kind="monthly_report", to=to, subject=subject, html=html, user_id=user_id,
                                    attachment=(filename, xlsx) if attach else None)
        return await finish("sent", None, email_masked=mask_email(to), with_attachment=bool(attach and included))
    except EmailError as e:
        return await finish("failed", e.code, retryable=e.transient, email_masked=mask_email(to))
    except Exception as e:  # nunca logamos conteúdo financeiro, só o tipo do erro
        logger.exception("Falha ao gerar relatório")
        return await finish("failed", f"erro_interno:{type(e).__name__}", retryable=True,
                            email_masked=mask_email(to))


async def process_monthly_batch(period: str | None = None) -> dict:
    period = period or default_report_period()
    stats = {"period": period, "sent": 0, "failed": 0, "skipped": 0, "already_done": 0}
    query = {"status": "active", "report_opt_in": True, **VERIFIED_EXPR}
    async for user in db.users.find(query, {"_id": 0, "id": 1}):
        run = await send_monthly_report(user["id"], period, "auto")
        if run is None:
            stats["already_done"] += 1
        else:
            stats[run["status"]] = stats.get(run["status"], 0) + 1
    logger.info("Lote mensal %s: %s", period, stats)
    return stats


async def daily_job() -> None:
    """Executado pelo agendador todo dia às 08:00 (horário de Brasília)."""
    await generate_recurring_all()
    if int(datetime.now(ZoneInfo("America/Sao_Paulo")).day) <= 5:
        await process_monthly_batch()
