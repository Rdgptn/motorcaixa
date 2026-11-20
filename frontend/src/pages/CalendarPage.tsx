import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MoneyInput, PageHeader, Panel } from "@/components/finance/ui";
import { apiDelete, apiGet, apiPut } from "@/lib/api-client";
import { brDate, centsToInput, compactMoney, errorMessage, money, monthLabel, parseMoney, shiftMonth } from "@/lib/formatters";
import { ME_KEY, useMe } from "@/lib/data-hooks";
import type { DayIn, DayOut, MonthDaysOut, UserOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function DayForm({ date, day, user, onDone }: { date: string; day?: DayOut; user: UserOut; onDone: () => void }) {
  const qc = useQueryClient();
  // Fontes ativas + fontes desativadas que já têm valor neste dia (para não "sumir" com dados antigos).
  const sources = user.income_sources.filter((s) => s.active || day?.entries.some((e) => e.source_id === s.id));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(sources.map((s) => [s.id, centsToInput(day?.entries.find((e) => e.source_id === s.id)?.amount_cents ?? 0)])));
  const [dayOff, setDayOff] = useState(day?.day_off ?? false);
  const [km, setKm] = useState(day?.km != null ? String(day.km) : "");
  const [notes, setNotes] = useState(day?.notes ?? "");
  const [newSource, setNewSource] = useState("");

  const parsed = sources.map((s) => ({ s, cents: parseMoney(values[s.id] ?? "") }));
  const invalid = parsed.some((p) => p.cents === null);
  const total = parsed.reduce((acc, p) => acc + (p.cents ?? 0), 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["days"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body: DayIn = {
        day_off: dayOff, km: km ? Number(km.replace(",", ".")) : null, notes,
        entries: dayOff ? [] : parsed.filter((p) => (p.cents ?? 0) > 0).map((p) => ({ source_id: p.s.id, source_name: p.s.name, amount_cents: p.cents ?? 0 })),
      };
      return apiPut<DayOut>(`/days/${date}`, body);
    },
    onSuccess: () => { toast.success("Dia salvo."); invalidate(); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/days/${date}`),
    onSuccess: () => { toast.success("Lançamentos do dia excluídos."); invalidate(); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addSource = useMutation({
    mutationFn: () => apiPut<UserOut>("/me/sources", { items: [...user.income_sources.map(({ id, name, active }) => ({ id, name, active })), { name: newSource.trim(), active: true }] }),
    onSuccess: (u) => {
      qc.setQueryData(ME_KEY, u);
      const created = u.income_sources[u.income_sources.length - 1];
      setValues((v) => ({ ...v, [created.id]: "" }));
      setNewSource("");
      toast.success(`Fonte “${created.name}” adicionada.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6" data-testid="day-form">
      <label className="flex items-center gap-3 rounded-lg border p-3 text-sm" data-testid="day-off-toggle">
        <Checkbox checked={dayOff} onCheckedChange={(v) => setDayOff(Boolean(v))} data-testid="day-off-checkbox" />
        <span><strong>Folga / sem ganhos neste dia</strong><br /><span className="text-muted-foreground">Registra que o dia teve R$ 0,00, diferente de “sem registro”.</span></span>
      </label>
      {!dayOff && (
        <div className="space-y-3">
          {sources.map((s) => (
            <div key={s.id} className="grid grid-cols-[1fr_1.3fr] items-center gap-3">
              <Label htmlFor={`src-${s.id}`} className="text-sm">{s.name}{!s.active && <span className="ml-1 text-xs text-muted-foreground">(inativa)</span>}</Label>
              <MoneyInput id={`src-${s.id}`} testId={`day-source-input-${s.id}`} value={values[s.id] ?? ""} onChange={(v) => setValues((old) => ({ ...old, [s.id]: v }))} />
            </div>
          ))}
          <div className="flex gap-2">
            <Input placeholder="Nova fonte (ex.: Loggi)" value={newSource} onChange={(e) => setNewSource(e.target.value)} className="h-10" maxLength={40} data-testid="day-new-source-input" />
            <Button type="button" variant="outline" className="h-10" disabled={!newSource.trim() || addSource.isPending} onClick={() => addSource.mutate()} data-testid="day-new-source-button">
              <Plus className="size-4" /> Fonte
            </Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="km">Km rodados (opcional)</Label>
          <Input id="km" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.,]/g, ""))} className="h-11" data-testid="day-km-input" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Observação</Label>
          <Input id="notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} className="h-11" data-testid="day-notes-input" />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-[#064E3B]/40 p-4">
        <span className="text-sm font-semibold uppercase tracking-wider text-emerald-200">Total do dia</span>
        <span className="font-mono text-2xl font-semibold tabular-nums" data-testid="day-total">{dayOff ? money(0) : money(total)}</span>
      </div>
      {invalid && <p className="text-sm text-red-300" role="alert">Confira os valores: use o formato 180,00.</p>}
      <div className="mt-auto flex gap-2">
        {day && (
          <Button variant="outline" className="h-12 text-red-300" disabled={remove.isPending} onClick={() => remove.mutate()} data-testid="day-delete-button">
            <Trash2 className="size-4" /> Excluir
          </Button>
        )}
        <Button className="h-12 flex-1 text-base" disabled={invalid || save.isPending} onClick={() => save.mutate()} data-testid="day-save-button">
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Salvar dia
        </Button>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const me = useMe();
  const [month, setMonth] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["days", month ?? "current"],
    // Sem mês escolhido, o servidor devolve o mês atual no fuso do usuário.
    queryFn: () => apiGet<MonthDaysOut>(month ? `/days?month=${month}` : "/days"),
  });
  const data = q.isError ? undefined : q.data;
  const current = month ?? data?.month ?? null;
  const today = data?.today ?? "";

  const cells = useMemo(() => {
    if (!current) return [];
    const y = Number(current.slice(0, 4)), m = Number(current.slice(5, 7));
    const firstDow = new Date(y, m - 1, 1).getDay();
    const count = new Date(y, m, 0).getDate();
    return [...Array(firstDow).fill(null), ...Array.from({ length: count }, (_, i) => `${current}-${String(i + 1).padStart(2, "0")}`)] as (string | null)[];
  }, [current]);
  const dayMap = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);
  const monthTotal = (data?.days ?? []).reduce((a, d) => a + d.total_cents, 0);
  const selectedDay = selected ? dayMap.get(selected) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader title="Calendário" subtitle="Toque em um dia para lançar ou consultar o faturamento." />
      <Panel testId="calendar-panel">
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" size="icon-lg" aria-label="Mês anterior" disabled={!current} onClick={() => current && setMonth(shiftMonth(current, -1))} data-testid="calendar-prev-month"><ChevronLeft /></Button>
          <div className="text-center">
            <p className="font-heading text-lg font-semibold" data-testid="calendar-month-label">{current ? monthLabel(current) : "..."}</p>
            <p className="font-mono text-sm tabular-nums text-primary" data-testid="calendar-month-total">{money(monthTotal)}</p>
          </div>
          <Button variant="ghost" size="icon-lg" aria-label="Próximo mês" disabled={!current} onClick={() => current && setMonth(shiftMonth(current, 1))} data-testid="calendar-next-month"><ChevronRight /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {WEEK.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        {q.isError && <p className="py-8 text-center text-sm text-muted-foreground" data-testid="calendar-error">Não foi possível carregar o calendário.</p>}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((iso, i) => {
            if (!iso) return <div key={`e${i}`} />;
            const d = dayMap.get(iso);
            const future = iso > today;
            const status = d ? (d.day_off || d.total_cents === 0 ? "folga" : "trabalhado") : future ? "futuro" : "sem_registro";
            const exp = data?.expense_by_day[iso] ?? 0;
            return (
              <button key={iso} disabled={future} onClick={() => setSelected(iso)} data-testid={`calendar-day-${iso}`} data-status={status}
                className={cn("relative flex min-h-16 flex-col items-start rounded-lg border p-1.5 text-left transition-[background-color,border-color,transform] active:scale-[0.97] sm:min-h-20 sm:p-2",
                  status === "trabalhado" && "border-primary/40 bg-primary/10 hover:bg-primary/20",
                  status === "folga" && "border-slate-600 bg-slate-800/50 hover:bg-slate-700/50",
                  status === "sem_registro" && "border-dashed border-warning/40 hover:bg-muted",
                  status === "futuro" && "cursor-not-allowed border-transparent opacity-40",
                  iso === today && "ring-2 ring-primary")}>
                <span className="text-xs font-semibold">{Number(iso.slice(8))}</span>
                {status === "trabalhado" && <span className="mt-auto w-full truncate font-mono text-[10px] font-semibold tabular-nums text-primary sm:text-xs"><span className="sm:hidden">{compactMoney(d!.total_cents)}</span><span className="hidden sm:inline">{money(d!.total_cents)}</span></span>}
                {status === "folga" && <span className="mt-auto text-[10px] text-slate-300 sm:text-xs">Folga</span>}
                {exp > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warning" title="Tem despesas" />}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" data-testid="calendar-legend">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-primary/40 bg-primary/20" /> Com ganhos</span>
          <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-slate-600 bg-slate-800" /> Folga / zero informado</span>
          <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-dashed border-warning/60" /> Sem registro</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning" /> Tem despesas</span>
        </div>
      </Panel>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="flex w-full flex-col max-sm:!w-full max-sm:!max-w-none sm:max-w-md" data-testid="day-sheet">
          <SheetHeader>
            <SheetTitle>{selected ? brDate(selected) : ""}</SheetTitle>
            <SheetDescription>{selectedDay ? `Última alteração salva. Total: ${money(selectedDay.total_cents)}` : "Dia sem registro. Informe os valores por fonte."}</SheetDescription>
          </SheetHeader>
          {selected && me.data && <DayForm key={selected + (selectedDay?.updated_at ?? "")} date={selected} day={selectedDay} user={me.data} onDone={() => setSelected(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
