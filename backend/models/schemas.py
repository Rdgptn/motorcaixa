"""Modelos Pydantic (contrato da API). Cada modelo tem uma interface TS espelhada em
frontend/src/lib/types.ts — ao alterar um, altere o outro na mesma edição.

Valores monetários trafegam SEMPRE em centavos (int) para evitar erros de ponto flutuante.
Datas trafegam como texto ISO: dia "AAAA-MM-DD", mês "AAAA-MM".
"""

import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

VehicleType = Literal["carro", "moto"]
DocumentType = Literal["cpf", "rg"]
SubscriptionStatus = Literal["trialing", "active", "past_due", "canceled", "expired"]
ExpenseKind = Literal["diaria", "mensal", "eventual"]
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
MAX_CENTS = 100_000_000  # R$ 1.000.000,00 por lançamento


def _check_date(v: str) -> str:
    if not DATE_RE.match(v):
        raise ValueError("data deve estar no formato AAAA-MM-DD")
    datetime.strptime(v, "%Y-%m-%d")  # valida dia/mês reais (ex.: 2025-02-30 falha)
    if not ("2000-01-01" <= v <= "2100-12-31"):
        raise ValueError("data fora do intervalo permitido")
    return v


def _check_password(v: str) -> str:
    if len(v) < 8 or len(v) > 128:
        raise ValueError("a senha deve ter entre 8 e 128 caracteres")
    if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("a senha deve conter letras e números")
    return v


# ---------- Auth ----------
class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str
    vehicle_type: VehicleType
    document_type: DocumentType
    document: str = Field(min_length=5, max_length=32)
    document_consent: bool

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)

    @field_validator("document")
    @classmethod
    def _doc(cls, v: str) -> str:
        return v.strip()

    @field_validator("document_consent")
    @classmethod
    def _consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("autorize o uso do documento para criar a conta")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class EmailIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class ChangeEmailIn(BaseModel):
    new_email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class MessageOut(BaseModel):
    message: str


# ---------- Usuário / ajustes ----------
class IncomeSource(BaseModel):
    id: str
    name: str
    active: bool = True
    builtin: bool = False


class ExpenseCategory(BaseModel):
    id: str
    name: str
    active: bool = True
    builtin: bool = False


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    email_verified: bool
    vehicle_type: VehicleType
    role: Literal["user", "admin"]
    plan: Literal["free", "pro"]
    status: Literal["active", "disabled"]
    timezone: str
    report_opt_in: bool
    report_attach: bool
    is_demo: bool
    income_sources: list[IncomeSource]
    expense_categories: list[ExpenseCategory]
    created_at: datetime
    document_type: Optional[DocumentType] = None
    trial_started_at: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    subscription_status: SubscriptionStatus = "trialing"
    subscription_ends_at: Optional[datetime] = None
    access_blocked: bool = False


class ProfilePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    vehicle_type: Optional[VehicleType] = None
    timezone: Optional[str] = Field(default=None, max_length=64)
    report_opt_in: Optional[bool] = None
    report_attach: Optional[bool] = None


class NamedItemIn(BaseModel):
    id: Optional[str] = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=40)
    active: bool = True


class NamedListIn(BaseModel):
    items: list[NamedItemIn] = Field(max_length=25)


# ---------- Faturamento por dia ----------
class DayEntry(BaseModel):
    source_id: str = Field(max_length=64)
    source_name: str = ""
    amount_cents: int = Field(ge=0, le=MAX_CENTS)


class DayIn(BaseModel):
    day_off: bool = False  # "folga / sem ganhos" informado explicitamente
    km: Optional[float] = Field(default=None, ge=0, le=5000)
    notes: str = Field(default="", max_length=300)
    entries: list[DayEntry] = Field(default_factory=list, max_length=25)


class DayOut(BaseModel):
    date: str
    day_off: bool
    km: Optional[float] = None
    notes: str = ""
    entries: list[DayEntry]
    total_cents: int
    updated_at: datetime


class MonthDaysOut(BaseModel):
    month: str
    today: str
    days: list[DayOut]
    expense_by_day: dict[str, int]


# ---------- Despesas ----------
class ExpenseIn(BaseModel):
    date: str
    category_id: str = Field(max_length=64)
    description: str = Field(min_length=1, max_length=120)
    amount_cents: int = Field(gt=0, le=MAX_CENTS)
    kind: ExpenseKind = "eventual"
    notes: str = Field(default="", max_length=300)

    @field_validator("date")
    @classmethod
    def _d(cls, v: str) -> str:
        return _check_date(v)


class ExpenseOut(BaseModel):
    id: str
    date: str
    category_id: str
    category_name: str
    description: str
    amount_cents: int
    kind: ExpenseKind
    notes: str = ""
    recurring_id: Optional[str] = None
    created_at: datetime


class RecurringIn(BaseModel):
    description: str = Field(min_length=1, max_length=120)
    category_id: str = Field(max_length=64)
    amount_cents: int = Field(gt=0, le=MAX_CENTS)
    day_of_month: int = Field(ge=1, le=28)
    active: bool = True
    notes: str = Field(default="", max_length=300)


class RecurringOut(BaseModel):
    id: str
    description: str
    category_id: str
    category_name: str
    amount_cents: int
    day_of_month: int
    active: bool
    notes: str = ""
    last_generated_month: Optional[str] = None
    created_at: datetime


class GenerateOut(BaseModel):
    generated: list[ExpenseOut]
    skipped_already_launched: list[str]


# ---------- Resumos / dashboard ----------
class NamedTotal(BaseModel):
    name: str
    cents: int


class DailyPoint(BaseModel):
    date: str
    revenue_cents: int
    expense_cents: int
    status: Literal["trabalhado", "folga", "sem_registro", "futuro"]


class PeriodSummary(BaseModel):
    start: str
    end: str
    revenue_cents: int
    expense_cents: int
    result_cents: int
    by_source: list[NamedTotal]
    by_category: list[NamedTotal]
    daily: list[DailyPoint]
    worked_days: int
    off_days: int
    no_record_days: int
    km_total: float
    cost_per_km_cents: Optional[int] = None
    revenue_per_km_cents: Optional[int] = None


class SummaryCompareOut(BaseModel):
    current: PeriodSummary
    previous: PeriodSummary


class Alert(BaseModel):
    kind: Literal["info", "warning", "success"]
    text: str


class DashboardOut(BaseModel):
    today: str
    month: str
    today_revenue_cents: int
    today_expense_cents: int
    current: PeriodSummary
    previous: PeriodSummary
    alerts: list[Alert]


class ReportRunOut(BaseModel):
    id: str
    period: str
    trigger: Literal["auto", "manual", "admin"]
    status: Literal["processing", "sent", "failed", "skipped"]
    attempts: int
    email_masked: str
    with_attachment: bool
    error: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None


class PlanInfo(BaseModel):
    id: Literal["free", "pro"]
    name: str
    price_cents: int
    trial_days: int
    features: list[str]


class PlansOut(BaseModel):
    plans: list[PlanInfo]
    current: Literal["free", "pro"]
    billing_enabled: bool


# ---------- Admin ----------
class AdminUserRow(BaseModel):
    id: str
    name: str
    email: str
    email_verified: bool
    vehicle_type: VehicleType
    role: Literal["user", "admin"]
    plan: Literal["free", "pro"]
    status: Literal["active", "disabled"]
    is_demo: bool
    report_opt_in: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None


class AdminUserDetail(BaseModel):
    user: AdminUserRow
    month: str
    summary: PeriodSummary
    runs: list[ReportRunOut]


class AdminUserPatch(BaseModel):
    status: Optional[Literal["active", "disabled"]] = None
    plan: Optional[Literal["free", "pro"]] = None
    role: Optional[Literal["user", "admin"]] = None
    mark_email_verified: Optional[bool] = None


class AdminStats(BaseModel):
    users_total: int
    users_verified: int
    users_carro: int
    users_moto: int
    users_pro: int
    users_disabled: int
    days_recorded: int
    expenses_recorded: int
    revenue_month_cents: int
    runs_sent: int
    runs_failed: int
    emails_failed_7d: int


class EmailLogOut(BaseModel):
    id: str
    kind: str
    to_masked: str
    status: Literal["sent", "failed"]
    error: Optional[str] = None
    created_at: datetime


class AuditOut(BaseModel):
    id: str
    actor_email: str
    action: str
    target: str
    created_at: datetime


class PeriodIn(BaseModel):
    period: str

    @field_validator("period")
    @classmethod
    def _p(cls, v: str) -> str:
        if not MONTH_RE.match(v):
            raise ValueError("período deve estar no formato AAAA-MM")
        return v


class ConfigIn(BaseModel):
    pro_price_cents: int = Field(ge=0, le=100_000)
    trial_days: int = Field(ge=0, le=90)
