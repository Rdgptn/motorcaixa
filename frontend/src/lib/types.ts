// Interfaces espelhadas MANUALMENTE de backend/models/schemas.py.
// Ao alterar um modelo Pydantic, altere a interface correspondente aqui na mesma edição.

export type VehicleType = "carro" | "moto";
export type ExpenseKind = "diaria" | "mensal" | "eventual";

export interface MessageOut { message: string }

export interface IncomeSource { id: string; name: string; active: boolean; builtin: boolean }
export interface ExpenseCategory { id: string; name: string; active: boolean; builtin: boolean }

export interface UserOut {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  vehicle_type: VehicleType;
  role: "user" | "admin";
  plan: "free" | "pro";
  status: "active" | "disabled";
  timezone: string;
  report_opt_in: boolean;
  report_attach: boolean;
  is_demo: boolean;
  income_sources: IncomeSource[];
  expense_categories: ExpenseCategory[];
  created_at: string;
}

export interface DayEntry { source_id: string; source_name: string; amount_cents: number }
export interface DayIn { day_off: boolean; km: number | null; notes: string; entries: DayEntry[] }
export interface DayOut {
  date: string;
  day_off: boolean;
  km: number | null;
  notes: string;
  entries: DayEntry[];
  total_cents: number;
  updated_at: string;
}
export interface MonthDaysOut { month: string; today: string; days: DayOut[]; expense_by_day: Record<string, number> }

export interface ExpenseIn {
  date: string;
  category_id: string;
  description: string;
  amount_cents: number;
  kind: ExpenseKind;
  notes: string;
}
export interface ExpenseOut extends ExpenseIn {
  id: string;
  category_name: string;
  recurring_id: string | null;
  created_at: string;
}
export interface RecurringIn {
  description: string;
  category_id: string;
  amount_cents: number;
  day_of_month: number;
  active: boolean;
  notes: string;
}
export interface RecurringOut extends RecurringIn {
  id: string;
  category_name: string;
  last_generated_month: string | null;
  created_at: string;
}
export interface GenerateOut { generated: ExpenseOut[]; skipped_already_launched: string[] }

export interface NamedTotal { name: string; cents: number }
export type DayStatus = "trabalhado" | "folga" | "sem_registro" | "futuro";
export interface DailyPoint { date: string; revenue_cents: number; expense_cents: number; status: DayStatus }
export interface PeriodSummary {
  start: string;
  end: string;
  revenue_cents: number;
  expense_cents: number;
  result_cents: number;
  by_source: NamedTotal[];
  by_category: NamedTotal[];
  daily: DailyPoint[];
  worked_days: number;
  off_days: number;
  no_record_days: number;
  km_total: number;
  cost_per_km_cents: number | null;
  revenue_per_km_cents: number | null;
}
export interface SummaryCompareOut { current: PeriodSummary; previous: PeriodSummary }
export interface Alert { kind: "info" | "warning" | "success"; text: string }
export interface DashboardOut {
  today: string;
  month: string;
  today_revenue_cents: number;
  today_expense_cents: number;
  current: PeriodSummary;
  previous: PeriodSummary;
  alerts: Alert[];
}

export interface ReportRunOut {
  id: string;
  period: string;
  trigger: "auto" | "manual" | "admin";
  status: "processing" | "sent" | "failed" | "skipped";
  attempts: number;
  email_masked: string;
  with_attachment: boolean;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  user_id: string | null;
  user_name: string | null;
}

export interface PlanInfo { id: "free" | "pro"; name: string; price_cents: number; trial_days: number; features: string[] }
export interface PlansOut { plans: PlanInfo[]; current: "free" | "pro"; billing_enabled: boolean }

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  vehicle_type: VehicleType;
  role: "user" | "admin";
  plan: "free" | "pro";
  status: "active" | "disabled";
  is_demo: boolean;
  report_opt_in: boolean;
  created_at: string;
  last_login_at: string | null;
}
export interface AdminUserDetail { user: AdminUserRow; month: string; summary: PeriodSummary; runs: ReportRunOut[] }
export interface AdminUserPatch {
  status?: "active" | "disabled";
  plan?: "free" | "pro";
  role?: "user" | "admin";
  mark_email_verified?: boolean;
}
export interface AdminStats {
  users_total: number;
  users_verified: number;
  users_carro: number;
  users_moto: number;
  users_pro: number;
  users_disabled: number;
  days_recorded: number;
  expenses_recorded: number;
  revenue_month_cents: number;
  runs_sent: number;
  runs_failed: number;
  emails_failed_7d: number;
}
export interface EmailLogOut { id: string; kind: string; to_masked: string; status: "sent" | "failed"; error: string | null; created_at: string }
export interface AuditOut { id: string; actor_email: string; action: string; target: string; created_at: string }
export interface ConfigIn { pro_price_cents: number; trial_days: number }
