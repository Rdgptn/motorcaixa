"""Serializadores de respostas da API, sem campos sensíveis."""

from lib.auth_dependencies import is_verified
from lib.identity import has_access
from lib.security import aware
from models.schemas import AdminUserRow, ExpenseOut, RecurringOut, ReportRunOut, UserOut


def user_out(u: dict) -> UserOut:
    return UserOut(
        id=u["id"], name=u["name"], email=u["email"], email_verified=is_verified(u),
        vehicle_type=u["vehicle_type"], role=u.get("role", "user"), plan=u.get("plan", "free"),
        status=u.get("status", "active"), timezone=u.get("timezone", "America/Sao_Paulo"),
        report_opt_in=u.get("report_opt_in", True), report_attach=u.get("report_attach", True),
        is_demo=u.get("is_demo", False), income_sources=u.get("income_sources", []),
        expense_categories=u.get("expense_categories", []), created_at=aware(u["created_at"]),
        document_type=u.get("document_type"), trial_started_at=aware(u.get("trial_started_at")),
        trial_ends_at=aware(u.get("trial_ends_at")), subscription_status=u.get("subscription_status", "trialing"),
        subscription_ends_at=aware(u.get("subscription_ends_at")), access_blocked=not has_access(u),
    )


def admin_row(u: dict) -> AdminUserRow:
    return AdminUserRow(
        id=u["id"], name=u["name"], email=u["email"], email_verified=is_verified(u),
        vehicle_type=u["vehicle_type"], role=u.get("role", "user"), plan=u.get("plan", "free"),
        status=u.get("status", "active"), is_demo=u.get("is_demo", False),
        report_opt_in=u.get("report_opt_in", True), created_at=aware(u["created_at"]),
        last_login_at=aware(u.get("last_login_at")),
    )


def expense_out(e: dict) -> ExpenseOut:
    return ExpenseOut(**{**e, "created_at": aware(e["created_at"])})


def recurring_out(r: dict) -> RecurringOut:
    return RecurringOut(**{**r, "created_at": aware(r["created_at"])})


def run_out(r: dict, user_name: str | None = None) -> ReportRunOut:
    return ReportRunOut(
        id=r["id"], period=r["period"], trigger=r["trigger"], status=r["status"], attempts=r["attempts"],
        email_masked=r.get("email_masked", ""), with_attachment=r.get("with_attachment", False),
        error=r.get("error"), created_at=aware(r["created_at"]), finished_at=aware(r.get("finished_at")),
        user_id=r.get("user_id"), user_name=user_name,
    )
