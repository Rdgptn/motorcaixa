import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Mail } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Disclaimer, KpiCard, NativeSelect, PageHeader, Panel, SkeletonBlock } from "@/components/finance/ui";
import { apiGet, apiPost } from "@/lib/api";
import { brDate, dateTime, errorMessage, money, monthEnd, monthLabel, shiftMonth } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import type { DashboardOut, ReportRunOut, SummaryCompareOut } from "@/lib/types";

type Preset = "month" | "prev" | "3m" | "custom";
const STATUS: Record<ReportRunOut["status"], string> = { sent: "Enviado", failed: "Falhou", skipped: "Omitido", processing: "Processando" };
const TRIGGER: Record<ReportRunOut["trigger"], string> = { auto: "Automático", manual: "Manual", admin: "Admin" };
const ERROR_TEXT: Record<string, string> = {
  insufficient_credits: "serviço de e-mail sem créditos", email_nao_confirmado: "e-mail não confirmado",
  envio_automatico_desativado: "envio automático desativado", dominio_reservado_demo: "conta demo (sem e-mail)",
};

function Bars({ data, color, testId }: { data: { name: string; cents: number }[]; color: string; testId: string }) {
  if (!data.length) return <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>Sem dados no período.</p>;
  return (
    <div className="h-56" data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((d) => ({ name: d.name, valor: d.cents / 100 }))} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke="#223147" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" stroke="#94A3B8" fontSize={11} width={110} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#1A263D" }} contentStyle={{ background: "#131C2E", border: "1px solid #223147", borderRadius: 8 }} formatter={(value: number) => [money(Math.round(value * 100)), "Valor"]} />
          <Bar dataKey="valor" fill={color} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Reports() {
  const me = useMe();
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<DashboardOut>("/dashboard") });
  const thisMonth = dash.data?.month ?? "";
  const today = dash.data?.today ?? "";
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const [xlsxMonth, setXlsxMonth] = useState("");

  const range = useMemo(() => {
    if (!thisMonth) return null;
    if (preset === "month") return { start: `${thisMonth}-01`, end: monthEnd(thisMonth) };
    if (preset === "prev") { const p = shiftMonth(thisMonth, -1); return { start: `${p}-01`, end: monthEnd(p) }; }
    if (preset === "3m") return { start: `${shiftMonth(thisMonth, -2)}-01`, end: monthEnd(thisMonth) };
    return custom.start && custom.end && custom.start <= custom.end ? custom : null;
  }, [preset, custom, thisMonth]);

  const q = useQuery({
    queryKey: ["summary", range?.start, range?.end],
    enabled: !!range,
    queryFn: () => apiGet<SummaryCompareOut>(`/reports/summary?start=${range!.start}&end=${range!.end}`),
  });
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => apiGet<ReportRunOut[]>("/reports/runs") });
  const monthOptions = thisMonth ? Array.from({ length: 12 }, (_, i) => shiftMonth(thisMonth, -i)) : [];
  const selectedXlsx = xlsxMonth || (thisMonth ? shiftMonth(thisMonth, -1) : "");
  const send = useMutation({
    mutationFn: () => apiPost<ReportRunOut>("/reports/send", { period: selectedXlsx }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      if (r.status === "sent") toast.success(`Relatório enviado para ${r.email_masked}.`);
      else toast.error(`Não foi possível enviar: ${ERROR_TEXT[r.error ?? ""] ?? r.error ?? "erro"}.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const s = q.isError ? undefined : q.data?.current;
  const p = q.isError ? undefined : q.data?.previous;
  const weekly = useMemo(() => {
    if (!s) return [];
    const weeks: { name: string; cents: number }[] = [];
    s.daily.forEach((d, i) => {
      const w = Math.floor(i / 7);
      if (!weeks[w]) weeks[w] = { name: `${brDate(d.date).slice(0, 5)}`, cents: 0 };
      weeks[w].cents += d.revenue_cents;
    });
    return weeks;
  }, [s]);

  return (
    <div className="space-y-5">
      <PageHeader title="Relatórios" subtitle="Indicadores calculados somente com os seus lançamentos." />
      <div className="flex flex-wrap items-center gap-2" data-testid="reports-presets">
        {([["month", "Este mês"], ["prev", "Mês anterior"], ["3m", "Últimos 3 meses"], ["custom", "Personalizado"]] as [Preset, string][]).map(([k, l]) => (
          <Button key={k} variant={preset === k ? "default" : "outline"} size="sm" onClick={() => setPreset(k)} data-testid={`reports-preset-${k}`}>{l}</Button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.start} max={today} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className="h-9 w-40" data-testid="reports-custom-start" />
            <span className="text-muted-foreground">até</span>
            <Input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className="h-9 w-40" data-testid="reports-custom-end" />
          </div>
        )}
        {range && (
          <a href={`/api/reports/csv?start=${range.start}&end=${range.end}`} className={buttonVariants({ variant: "outline", size: "sm", className: "sm:ml-auto" })} data-testid="reports-csv-export">
            <Download className="size-4" /> Exportar CSV
          </a>
        )}
      </div>

      {q.isLoading && <SkeletonBlock className="h-48" />}
      {q.isError && <p className="text-sm text-muted-foreground" data-testid="reports-error">{errorMessage(q.error, "Não foi possível carregar o relatório.")}</p>}
      {s && p && (
        <>
          <p className="text-sm text-muted-foreground" data-testid="reports-range-label">Período: {brDate(s.start)} a {brDate(s.end)} · comparado com {brDate(p.start)} a {brDate(p.end)}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard testId="report-kpi-revenue" label="Faturamento" cents={s.revenue_cents} prev={p.revenue_cents} />
            <KpiCard testId="report-kpi-expense" label="Despesas" cents={s.expense_cents} prev={p.expense_cents} invert />
            <KpiCard testId="report-kpi-result" label="Resultado estimado" cents={s.result_cents} prev={p.result_cents} tone={s.result_cents >= 0 ? "positive" : "negative"} />
            <div className="rounded-xl border bg-card p-4" data-testid="report-days">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dias</p>
              <p className="mt-2 text-sm"><strong className="font-mono text-lg">{s.worked_days}</strong> trabalhados</p>
              <p className="text-sm text-muted-foreground">{s.off_days} folga/zero · {s.no_record_days} sem registro</p>
            </div>
          </div>
          {s.km_total > 0 && (
            <div className="grid grid-cols-3 gap-3" data-testid="report-km">
              <div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Km informados</p><p className="mt-1 font-mono text-lg tabular-nums">{s.km_total.toLocaleString("pt-BR")}</p></div>
              <div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Ganho por km</p><p className="mt-1 font-mono text-lg tabular-nums">{money(s.revenue_per_km_cents ?? 0)}</p></div>
              <div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Custo por km</p><p className="mt-1 font-mono text-lg tabular-nums">{money(s.cost_per_km_cents ?? 0)}</p></div>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Faturamento por fonte"><Bars testId="report-by-source" data={s.by_source} color="#10B981" /></Panel>
            <Panel title="Despesas por categoria"><Bars testId="report-by-category" data={s.by_category} color="#F59E0B" /></Panel>
          </div>
          <Panel title="Faturamento por semana (início da semana)"><Bars testId="report-by-week" data={weekly} color="#38BDF8" /></Panel>
          <Panel title="Como calculamos" testId="report-formulas">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Resultado estimado</strong> = faturamento − despesas registradas no período.</li>
              <li><strong className="text-foreground">Dia trabalhado</strong> = dia com registro e valor maior que zero. <strong className="text-foreground">Folga/zero</strong> = você marcou folga ou informou R$ 0,00.</li>
              <li><strong className="text-foreground">Sem registro</strong> = dia passado sem lançamento. Não presumimos que foi folga.</li>
              <li><strong className="text-foreground">Custo por km</strong> = despesas ÷ km informados (aparece só quando há km lançado).</li>
              <li>Comparação: período anterior com o mesmo número de dias.</li>
            </ul>
          </Panel>
        </>
      )}

      <Panel title="Planilha mensal (Excel)" testId="report-xlsx-panel">
        <p className="mb-4 text-sm text-muted-foreground">
          Todo dia 1º, às 08h (Brasília), geramos a planilha do mês que fechou e enviamos para o seu e-mail confirmado
          {me.data ? <> (<strong className="text-foreground">{me.data.report_opt_in ? "envio automático ativado" : "envio automático desativado"}</strong>)</> : null}.
          Você também pode baixar ou reenviar quando quiser.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <NativeSelect className="sm:w-56" value={selectedXlsx} onChange={(e) => setXlsxMonth(e.target.value)} data-testid="report-xlsx-month-select">
            {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </NativeSelect>
          <a href={selectedXlsx ? `/api/reports/xlsx/${selectedXlsx}` : undefined} className={buttonVariants({ className: "h-11" })} data-testid="report-xlsx-download">
            <FileSpreadsheet className="size-4" /> Baixar .xlsx
          </a>
          <Button variant="outline" className="h-11" disabled={!selectedXlsx || send.isPending} onClick={() => send.mutate()} data-testid="report-xlsx-send">
            {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Enviar para meu e-mail
          </Button>
        </div>
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Histórico de envios</p>
          {(runs.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground" data-testid="report-runs-empty">Nenhum envio ainda.</p> : (
            <ul className="divide-y rounded-lg border text-sm" data-testid="report-runs-list">
              {(runs.data ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="font-medium">{monthLabel(r.period)}</span>
                  <Badge variant="outline">{TRIGGER[r.trigger]}</Badge>
                  <Badge className={r.status === "sent" ? "bg-primary/15 text-primary" : r.status === "failed" ? "bg-destructive/15 text-red-300" : "bg-muted text-muted-foreground"}>{STATUS[r.status]}</Badge>
                  {r.error && <span className="text-xs text-muted-foreground">({ERROR_TEXT[r.error] ?? r.error})</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{r.email_masked} · {dateTime(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      <Disclaimer />
    </div>
  );
}
