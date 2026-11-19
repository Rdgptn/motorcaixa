import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Repeat, Trash2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, MoneyInput, NativeSelect, PageHeader, Panel, SkeletonBlock } from "@/components/finance/ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { brDate, centsToInput, errorMessage, money, monthEnd, monthLabel, parseMoney, shiftMonth } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import type { DashboardOut, ExpenseIn, ExpenseKind, ExpenseOut, GenerateOut, RecurringIn, RecurringOut, UserOut } from "@/lib/types";

const KIND_LABEL: Record<ExpenseKind, string> = { diaria: "Diária", mensal: "Mensal", eventual: "Eventual" };

function useInvalidate() {
  const qc = useQueryClient();
  return () => ["expenses", "recurring", "dashboard", "summary", "days"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

function ExpenseDialog({ open, onClose, user, editing, today }: { open: boolean; onClose: () => void; user: UserOut; editing: ExpenseOut | null; today: string }) {
  const invalidate = useInvalidate();
  const cats = user.expense_categories.filter((c) => c.active || c.id === editing?.category_id);
  const [date, setDate] = useState(editing?.date ?? today);
  const [category, setCategory] = useState(editing?.category_id ?? cats[0]?.id ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amount_cents) : "");
  const [kind, setKind] = useState<ExpenseKind>(editing?.kind ?? "eventual");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: (body: ExpenseIn) => editing ? apiPut<ExpenseOut>(`/expenses/${editing.id}`, body) : apiPost<ExpenseOut>("/expenses", body),
    onSuccess: () => { toast.success(editing ? "Despesa atualizada." : "Despesa lançada."); invalidate(); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return setError("Informe um valor maior que zero.");
    if (!description.trim()) return setError("Informe uma descrição.");
    setError("");
    save.mutate({ date, category_id: category, description: description.trim(), amount_cents: cents, kind, notes });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="expense-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar despesa" : "Nova despesa"}</DialogTitle>
          <DialogDescription>Valores em reais. A data define em qual dia/mês a despesa é contabilizada.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" id="expense-form">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="exp-amount">Valor</Label><MoneyInput id="exp-amount" testId="expense-amount-input" value={amount} onChange={setAmount} /></div>
            <div className="space-y-1.5"><Label htmlFor="exp-date">Data</Label><Input id="exp-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="h-11" data-testid="expense-date-input" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="exp-desc">Descrição</Label><Input id="exp-desc" maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} className="h-11" placeholder="Ex.: Abastecimento" data-testid="expense-description-input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="exp-cat">Categoria</Label>
              <NativeSelect id="exp-cat" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="expense-category-select">
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="exp-kind">Tipo</Label>
              <NativeSelect id="exp-kind" value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind)} data-testid="expense-kind-select">
                <option value="diaria">Diária</option><option value="mensal">Mensal</option><option value="eventual">Eventual</option>
              </NativeSelect></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="exp-notes">Observações (opcional)</Label><Input id="exp-notes" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11" data-testid="expense-notes-input" /></div>
          {kind === "mensal" && !editing && <p className="text-xs text-muted-foreground">Dica: se ela se repete todo mês, cadastre em “Recorrentes” para gerar automaticamente, sem duplicar.</p>}
          {error && <p role="alert" className="text-sm text-red-300" data-testid="expense-error">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form="expense-form" className="h-11 w-full sm:w-auto" disabled={save.isPending} data-testid="expense-save-button">
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecurringDialog({ open, onClose, user, editing }: { open: boolean; onClose: () => void; user: UserOut; editing: RecurringOut | null }) {
  const invalidate = useInvalidate();
  const cats = user.expense_categories.filter((c) => c.active || c.id === editing?.category_id);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [category, setCategory] = useState(editing?.category_id ?? cats[0]?.id ?? "");
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amount_cents) : "");
  const [day, setDay] = useState(String(editing?.day_of_month ?? 10));
  const [active, setActive] = useState(editing?.active ?? true);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async (body: RecurringIn) => {
      const r = editing ? await apiPut<RecurringOut>(`/recurring/${editing.id}`, body) : await apiPost<RecurringOut>("/recurring", body);
      const gen = await apiPost<GenerateOut>("/recurring/generate");
      return { r, gen };
    },
    onSuccess: ({ gen }) => {
      toast.success("Despesa recorrente salva.");
      if (gen.generated.length) toast.info(`${gen.generated.length} ocorrência(s) gerada(s) para este mês.`);
      invalidate(); onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(amount);
    const d = Number(day);
    if (!cents || cents <= 0) return setError("Informe um valor maior que zero.");
    if (!(d >= 1 && d <= 28)) return setError("Vencimento deve ser entre os dias 1 e 28.");
    setError("");
    save.mutate({ description: description.trim(), category_id: category, amount_cents: cents, day_of_month: d, active, notes: "" });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="recurring-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar recorrente" : "Nova despesa recorrente"}</DialogTitle>
          <DialogDescription>Gerada uma vez por mês, no dia do vencimento. Se você já lançou manualmente uma despesa igual no mês, ela não é gerada de novo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" id="recurring-form">
          <div className="space-y-1.5"><Label htmlFor="rec-desc">Descrição</Label><Input id="rec-desc" required maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} className="h-11" placeholder="Ex.: Aluguel do carro" data-testid="recurring-description-input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="rec-amount">Valor</Label><MoneyInput id="rec-amount" testId="recurring-amount-input" value={amount} onChange={setAmount} /></div>
            <div className="space-y-1.5"><Label htmlFor="rec-day">Vence todo dia</Label><Input id="rec-day" type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} className="h-11" data-testid="recurring-day-input" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rec-cat">Categoria</Label>
            <NativeSelect id="rec-cat" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="recurring-category-select">
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={active} onCheckedChange={(v) => setActive(Boolean(v))} data-testid="recurring-active-checkbox" /> Ativa</label>
          {error && <p role="alert" className="text-sm text-red-300" data-testid="recurring-error">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form="recurring-form" className="h-11 w-full sm:w-auto" disabled={save.isPending} data-testid="recurring-save-button">
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Expenses() {
  const me = useMe();
  const invalidate = useInvalidate();
  const [params, setParams] = useSearchParams();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<DashboardOut>("/dashboard") });
  const today = dash.data?.today ?? "";
  const [month, setMonth] = useState<string | null>(null);
  const cur = month ?? dash.data?.month ?? null;
  const [catFilter, setCatFilter] = useState("");
  const [dialog, setDialog] = useState<{ expense: ExpenseOut | null } | null>(params.get("nova") ? { expense: null } : null);
  const [recDialog, setRecDialog] = useState<{ rule: RecurringOut | null } | null>(null);
  const [toDelete, setToDelete] = useState<ExpenseOut | null>(null);

  const list = useQuery({
    queryKey: ["expenses", cur, catFilter],
    enabled: !!cur,
    queryFn: () => apiGet<ExpenseOut[]>(`/expenses?start=${cur}-01&end=${monthEnd(cur!)}${catFilter ? `&category_id=${catFilter}` : ""}`),
  });
  const rules = useQuery({ queryKey: ["recurring"], queryFn: () => apiGet<RecurringOut[]>("/recurring") });
  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/expenses/${id}`),
    onSuccess: () => { toast.success("Despesa excluída."); invalidate(); setToDelete(null); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const delRule = useMutation({
    mutationFn: (id: string) => apiDelete(`/recurring/${id}`),
    onSuccess: () => { toast.success("Regra excluída. Despesas já geradas foram mantidas."); invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const generate = useMutation({
    mutationFn: () => apiPost<GenerateOut>("/recurring/generate"),
    onSuccess: (r) => {
      invalidate();
      if (r.generated.length) toast.success(`${r.generated.length} despesa(s) recorrente(s) gerada(s).`);
      else toast.info("Nenhuma ocorrência pendente para gerar agora.");
      if (r.skipped_already_launched.length) toast.info(`Não geradas por já estarem lançadas no mês: ${r.skipped_already_launched.join(", ")}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const items = list.isError ? [] : list.data ?? [];
  const total = items.reduce((a, e) => a + e.amount_cents, 0);
  const closeDialog = () => { setDialog(null); if (params.get("nova")) setParams({}, { replace: true }); };

  return (
    <div className="space-y-5">
      <PageHeader title="Despesas" subtitle="Diárias, mensais e eventuais."
        actions={<Button className="h-11" onClick={() => setDialog({ expense: null })} disabled={!me.data || !today} data-testid="expense-add-button"><Plus className="size-4" /> Nova despesa</Button>} />
      <Tabs defaultValue="list">
        <TabsList className="mb-4">
          <TabsTrigger value="list" data-testid="expenses-tab-list">Lançamentos</TabsTrigger>
          <TabsTrigger value="recurring" data-testid="expenses-tab-recurring">Recorrentes</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
              <Button variant="ghost" size="icon" aria-label="Mês anterior" disabled={!cur} onClick={() => cur && setMonth(shiftMonth(cur, -1))} data-testid="expenses-prev-month"><ChevronLeft /></Button>
              <span className="min-w-36 text-center text-sm font-semibold" data-testid="expenses-month-label">{cur ? monthLabel(cur) : "..."}</span>
              <Button variant="ghost" size="icon" aria-label="Próximo mês" disabled={!cur} onClick={() => cur && setMonth(shiftMonth(cur, 1))} data-testid="expenses-next-month"><ChevronRight /></Button>
            </div>
            <NativeSelect className="sm:w-64" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} data-testid="expenses-category-filter">
              <option value="">Todas as categorias</option>
              {me.data?.expense_categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
            <p className="text-sm sm:ml-auto">Total: <span className="font-mono font-semibold tabular-nums text-warning" data-testid="expenses-total">{money(total)}</span></p>
          </div>
          {list.isLoading && <SkeletonBlock className="h-40" />}
          {list.isError && <p className="text-sm text-muted-foreground" data-testid="expenses-error">Não foi possível carregar as despesas.</p>}
          {!list.isLoading && !list.isError && items.length === 0 && (
            <EmptyState testId="expenses-empty" title="Nenhuma despesa neste mês" text="Registre combustível, manutenção, alimentação e outros gastos." />
          )}
          <ul className="divide-y rounded-xl border bg-card" data-testid="expenses-list">
            {items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3" data-testid={`expense-row-${e.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.description}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{brDate(e.date)}</span><span>·</span><span>{e.category_name}</span>
                    <Badge variant="outline" className="h-5 text-[10px]">{KIND_LABEL[e.kind]}</Badge>
                    {e.recurring_id && <Badge className="h-5 bg-info/15 text-[10px] text-info"><Repeat className="size-3" /> automática</Badge>}
                  </p>
                </div>
                <span className="font-mono font-semibold tabular-nums">{money(e.amount_cents)}</span>
                <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setDialog({ expense: e })} data-testid={`expense-edit-${e.id}`}><Pencil className="size-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setToDelete(e)} data-testid={`expense-delete-${e.id}`}><Trash2 className="size-4 text-red-300" /></Button>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="recurring" className="space-y-4">
          <Panel title="Despesas recorrentes" action={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending} data-testid="recurring-generate-button"><Wand2 className="size-4" /> Gerar pendentes</Button>
              <Button size="sm" onClick={() => setRecDialog({ rule: null })} disabled={!me.data} data-testid="recurring-add-button"><Plus className="size-4" /> Nova</Button>
            </div>}>
            <p className="mb-4 text-sm text-muted-foreground">Como funciona: no dia do vencimento, o sistema cria a despesa do mês uma única vez (o agendador roda diariamente às 08h). Você é avisado no painel inicial quando isso acontece.</p>
            {(rules.data ?? []).length === 0 ? <EmptyState testId="recurring-empty" title="Nenhuma despesa recorrente" text="Ex.: aluguel do veículo, plano de celular, seguro." /> : (
              <ul className="divide-y rounded-lg border" data-testid="recurring-list">
                {(rules.data ?? []).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3" data-testid={`recurring-row-${r.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.description} {!r.active && <Badge variant="outline">inativa</Badge>}</p>
                      <p className="text-xs text-muted-foreground">Todo dia {r.day_of_month} · {r.category_name}{r.last_generated_month ? ` · último mês processado: ${r.last_generated_month}` : ""}</p>
                    </div>
                    <span className="font-mono font-semibold tabular-nums">{money(r.amount_cents)}</span>
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setRecDialog({ rule: r })} data-testid={`recurring-edit-${r.id}`}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => delRule.mutate(r.id)} data-testid={`recurring-delete-${r.id}`}><Trash2 className="size-4 text-red-300" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      {dialog && me.data && today && <ExpenseDialog open onClose={closeDialog} user={me.data} editing={dialog.expense} today={today} />}
      {recDialog && me.data && <RecurringDialog open onClose={() => setRecDialog(null)} user={me.data} editing={recDialog.rule} />}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent data-testid="expense-delete-dialog">
          <DialogHeader>
            <DialogTitle>Excluir despesa?</DialogTitle>
            <DialogDescription>{toDelete ? `${toDelete.description} · ${money(toDelete.amount_cents)} em ${brDate(toDelete.date)}. Esta ação não pode ser desfeita.` : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={del.isPending} onClick={() => toDelete && del.mutate(toDelete.id)} data-testid="expense-delete-confirm">Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
