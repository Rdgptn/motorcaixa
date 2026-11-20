import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, CheckCircle2, Info, ReceiptText } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buttonVariants } from "@/components/ui/button";
import { CHART_COLORS, Disclaimer, EmptyState, KpiCard, PageHeader, Panel, SkeletonBlock } from "@/components/finance/ui";
import { apiGet } from "@/lib/api-client";
import { money, monthLabel } from "@/lib/formatters";
import { useMe } from "@/lib/data-hooks";
import type { DashboardOut } from "@/lib/types";

const ALERT_ICON = { warning: AlertTriangle, info: Info, success: CheckCircle2 };

export default function Dashboard() {
  const me = useMe();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<DashboardOut>("/dashboard") });
  const d = q.isError ? undefined : q.data;
  const first = me.data?.name.split(" ")[0] ?? "";

  const chart = (d?.current.daily ?? []).filter((p) => p.status !== "futuro").map((p) => ({
    dia: p.date.slice(8), Faturamento: p.revenue_cents / 100, Despesas: p.expense_cents / 100,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title={`Olá, ${first}!`}
        subtitle={d ? <>Resumo de <span>{monthLabel(d.month)}</span></> : "Seu resumo do mês"}
        actions={<>
          <Link to="/app/calendario" className={buttonVariants({ className: "h-11" })} data-testid="dashboard-add-revenue-button"><CalendarPlus className="size-4" /> Lançar ganho</Link>
          <Link to="/app/despesas?nova=1" className={buttonVariants({ variant: "outline", className: "h-11" })} data-testid="dashboard-add-expense-button"><ReceiptText className="size-4" /> Lançar despesa</Link>
        </>} />

      {q.isError && <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-testid="dashboard-error">Não foi possível carregar o resumo agora.</p>}
      {!d && !q.isError && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-28" />)}</div>}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard testId="kpi-today-revenue" label="Faturamento hoje" cents={d.today_revenue_cents} hint="Lançado hoje" />
            <KpiCard testId="kpi-month-revenue" label="Faturamento no mês" cents={d.current.revenue_cents} prev={d.previous.revenue_cents} />
            <KpiCard testId="kpi-today-expense" label="Despesas hoje" cents={d.today_expense_cents} hint="Lançado hoje" />
            <KpiCard testId="kpi-month-expense" label="Despesas no mês" cents={d.current.expense_cents} prev={d.previous.expense_cents} invert />
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
            <KpiCard testId="kpi-month-result" label="Resultado operacional estimado"
              cents={d.current.result_cents} prev={d.previous.result_cents}
              tone={d.current.result_cents >= 0 ? "positive" : "negative"} />
            <div className="grid grid-cols-3 gap-3">
              {[["Dias trabalhados", d.current.worked_days, "worked"], ["Folgas / zero", d.current.off_days, "off"], ["Sem registro", d.current.no_record_days, "norecord"]].map(([l, v, id]) => (
                <div key={id} className="rounded-xl border bg-card p-4" data-testid={`dashboard-days-${id}`}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{l}</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {d.alerts.length > 0 && (
            <div className="space-y-2" data-testid="dashboard-alerts">
              {d.alerts.map((a, i) => {
                const Icon = ALERT_ICON[a.kind];
                return (
                  <div key={i} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm" data-testid={`dashboard-alert-${i}`}>
                    <Icon className={a.kind === "warning" ? "size-4 text-warning" : a.kind === "success" ? "size-4 text-primary" : "size-4 text-info"} aria-hidden />
                    <span>{a.text}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Faturamento x despesas por dia" className="lg:col-span-2" testId="dashboard-trend-chart">
              {d.current.revenue_cents + d.current.expense_cents === 0 ? (
                <EmptyState testId="dashboard-trend-empty" title="Ainda sem lançamentos neste mês" text="Comece pelo calendário: escolha o dia e informe quanto fez em cada plataforma." />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart} margin={{ left: -12, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.45} /><stop offset="100%" stopColor="#10B981" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F59E0B" stopOpacity={0.35} /><stop offset="100%" stopColor="#F59E0B" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid stroke="#223147" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="dia" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} width={48} />
                      <Tooltip contentStyle={{ background: "#131C2E", border: "1px solid #223147", borderRadius: 8 }}
                        formatter={(value: number, name: string) => [money(Math.round(value * 100)), name]} labelFormatter={(l: string) => `Dia ${l}`} />
                      <Area type="monotone" dataKey="Faturamento" stroke="#10B981" strokeWidth={2} fill="url(#gRev)" />
                      <Area type="monotone" dataKey="Despesas" stroke="#F59E0B" strokeWidth={2} fill="url(#gExp)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel title="Faturamento por fonte" testId="dashboard-source-chart">
              {d.current.by_source.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem faturamento no mês.</p>
              ) : (
                <>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={d.current.by_source.map((s) => ({ name: s.name, value: s.cents / 100 }))} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2} stroke="none">
                          {d.current.by_source.map((s, i) => <Cell key={s.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#131C2E", border: "1px solid #223147", borderRadius: 8 }} formatter={(value: number, name: string) => [money(Math.round(value * 100)), name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm">
                    {d.current.by_source.map((s, i) => (
                      <li key={s.name} className="flex items-center justify-between" data-testid={`dashboard-source-${i}`}>
                        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{s.name}</span>
                        <span className="font-mono tabular-nums">{money(s.cents)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </div>
          <Disclaimer />
        </>
      )}
    </div>
  );
}
