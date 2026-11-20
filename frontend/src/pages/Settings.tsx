import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bike, Car, Check, Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, PageHeader, Panel } from "@/components/finance/ui";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api-client";
import { errorMessage, money } from "@/lib/formatters";
import { ME_KEY, useMe } from "@/lib/data-hooks";
import type { MessageOut, PlansOut, UserOut, VehicleType } from "@/lib/types";
import { passwordProblem } from "@/pages/Signup";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  ["America/Sao_Paulo", "Brasília (padrão)"], ["America/Manaus", "Manaus"], ["America/Cuiaba", "Cuiabá"],
  ["America/Belem", "Belém"], ["America/Fortaleza", "Fortaleza"], ["America/Recife", "Recife"],
  ["America/Porto_Velho", "Porto Velho"], ["America/Rio_Branco", "Rio Branco"], ["America/Noronha", "Fernando de Noronha"],
];

type Item = { id?: string; name: string; active: boolean; builtin?: boolean };

function ListEditor({ title, kind, items, testId }: { title: string; kind: "sources" | "categories"; items: Item[]; testId: string }) {
  const qc = useQueryClient();
  const [list, setList] = useState<Item[]>(items);
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: (next: Item[]) => apiPut<UserOut>(`/me/${kind}`, { items: next.map(({ id, name, active }) => ({ id, name, active })) }),
    onSuccess: (u) => { qc.setQueryData(ME_KEY, u); setList(kind === "sources" ? u.income_sources : u.expense_categories); toast.success("Salvo."); },
    onError: (e) => { toast.error(errorMessage(e)); setList(items); },
  });
  const update = (next: Item[]) => { setList(next); save.mutate(next); };
  return (
    <Panel title={title} testId={testId}>
      <ul className="space-y-2">
        {list.map((it, i) => (
          <li key={it.id ?? i} className="flex items-center gap-3 rounded-lg border px-3 py-2" data-testid={`${testId}-item-${it.id}`}>
            <Checkbox checked={it.active} onCheckedChange={(v) => update(list.map((x, j) => (j === i ? { ...x, active: Boolean(v) } : x)))} data-testid={`${testId}-toggle-${it.id}`} aria-label={`Ativar ${it.name}`} />
            <span className={cn("flex-1 text-sm", !it.active && "text-muted-foreground line-through")}>{it.name}</span>
            {it.builtin ? <Badge variant="outline" className="text-[10px]">padrão</Badge> : (
              <Button variant="ghost" size="icon-sm" aria-label={`Remover ${it.name}`} onClick={() => update(list.filter((_, j) => j !== i))} data-testid={`${testId}-remove-${it.id}`}><X className="size-4" /></Button>
            )}
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { update([...list, { name: name.trim(), active: true }]); setName(""); } }}>
        <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={kind === "sources" ? "Nova fonte (ex.: Loggi, Lalamove)" : "Nova categoria"} className="h-10" data-testid={`${testId}-new-input`} />
        <Button type="submit" variant="outline" className="h-10" disabled={!name.trim() || save.isPending} data-testid={`${testId}-add-button`}><Plus className="size-4" /> Adicionar</Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Desativar esconde o item dos formulários, mas mantém o histórico. Itens padrão não podem ser apagados.</p>
    </Panel>
  );
}

function ProfileForm({ user }: { user: UserOut }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [tz, setTz] = useState(user.timezone);
  const patch = useMutation({
    mutationFn: (body: Partial<Pick<UserOut, "name" | "timezone" | "vehicle_type" | "report_opt_in" | "report_attach">>) => apiPatch<UserOut>("/me", body),
    onSuccess: (u) => { qc.setQueryData(ME_KEY, u); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Preferências salvas."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const Vehicle = ({ v, label, Icon }: { v: VehicleType; label: string; Icon: typeof Car }) => (
    <button type="button" onClick={() => patch.mutate({ vehicle_type: v })} aria-pressed={user.vehicle_type === v} data-testid={`settings-vehicle-${v}`}
      className={cn("flex flex-1 items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors", user.vehicle_type === v ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
      <Icon className="size-4" /> {label}
    </button>
  );
  return (
    <>
      <Panel title="Perfil" testId="settings-profile">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); patch.mutate({ name, timezone: tz }); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="name">Nome</Label><Input id="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-11" data-testid="settings-name-input" /></div>
            <div className="space-y-1.5"><Label htmlFor="tz">Fuso horário</Label>
              <NativeSelect id="tz" value={tz} onChange={(e) => setTz(e.target.value)} data-testid="settings-timezone-select">
                {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect></div>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de atividade</Label>
            <div className="flex gap-2"><Vehicle v="carro" label="Carro" Icon={Car} /><Vehicle v="moto" label="Moto" Icon={Bike} /></div>
            <p className="text-xs text-muted-foreground">Ao trocar, adicionamos as fontes e categorias do novo perfil sem apagar as suas.</p>
          </div>
          <Button type="submit" disabled={patch.isPending} data-testid="settings-profile-save">{patch.isPending && <Loader2 className="size-4 animate-spin" />} Salvar perfil</Button>
        </form>
      </Panel>
      <Panel title="Relatório mensal por e-mail" testId="settings-report-prefs">
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <Checkbox checked={user.report_opt_in} onCheckedChange={(v) => patch.mutate({ report_opt_in: Boolean(v) })} data-testid="settings-report-optin" />
            <span><strong>Receber automaticamente no dia 1º</strong><br /><span className="text-muted-foreground">Planilha do mês anterior, enviada somente para seu e-mail confirmado.</span></span>
          </label>
          <label className="flex items-start gap-3">
            <Checkbox checked={user.report_attach} onCheckedChange={(v) => patch.mutate({ report_attach: Boolean(v) })} data-testid="settings-report-attach" />
            <span><strong>Anexar a planilha ao e-mail</strong><br /><span className="text-muted-foreground">Se desativado, o e-mail só avisa, e você baixa a planilha no app, com login.</span></span>
          </label>
        </div>
      </Panel>
    </>
  );
}

function SecurityForms({ user }: { user: UserOut }) {
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const changeEmail = useMutation({
    mutationFn: () => apiPost<MessageOut>("/me/email", { new_email: newEmail, password: emailPw }),
    onSuccess: (r) => { toast.success(r.message); setNewEmail(""); setEmailPw(""); qc.invalidateQueries({ queryKey: ME_KEY }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resend = useMutation({
    mutationFn: () => apiPost<MessageOut>("/auth/resend-verification"),
    onSuccess: (r) => toast.success(r.message), onError: (e) => toast.error(errorMessage(e)),
  });
  const changePw = useMutation({
    mutationFn: () => apiPost<MessageOut>("/me/password", { current_password: cur, new_password: pw }),
    onSuccess: (r) => { toast.success(r.message); setCur(""); setPw(""); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submitPw = (e: FormEvent) => { e.preventDefault(); const p = passwordProblem(pw); if (p) return toast.error(p); changePw.mutate(); };
  return (
    <>
      <Panel title="E-mail" testId="settings-email">
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span data-testid="settings-current-email">{user.email}</span>
          {user.email_verified ? <Badge className="bg-primary/15 text-primary"><Check className="size-3" /> confirmado</Badge> : <Badge className="bg-warning/15 text-warning">pendente</Badge>}
          {!user.email_verified && <Button size="sm" variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending} data-testid="settings-resend-verification">Reenviar confirmação</Button>}
        </p>
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); changeEmail.mutate(); }}>
          <Input type="email" required placeholder="Novo e-mail" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="h-11" data-testid="settings-new-email-input" />
          <Input type="password" required placeholder="Sua senha" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} className="h-11" data-testid="settings-email-password-input" />
          <Button type="submit" className="h-11" disabled={changeEmail.isPending} data-testid="settings-change-email-button">Alterar</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">O novo endereço precisa ser confirmado. Até lá, nenhum relatório é enviado.</p>
      </Panel>
      <Panel title="Senha" testId="settings-password">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={submitPw}>
          <Input type="password" required placeholder="Senha atual" value={cur} onChange={(e) => setCur(e.target.value)} className="h-11" data-testid="settings-current-password-input" />
          <Input type="password" required placeholder="Nova senha" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11" data-testid="settings-new-password-input" />
          <Button type="submit" className="h-11" disabled={changePw.isPending} data-testid="settings-change-password-button">Trocar senha</Button>
        </form>
      </Panel>
    </>
  );
}

export default function Settings() {
  const me = useMe();
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => apiGet<PlansOut>("/me/plans") });
  const user = me.data;
  if (!user) return <PageHeader title="Ajustes" />;
  return (
    <div className="space-y-5">
      <PageHeader title="Ajustes" subtitle="Perfil, fontes de renda, categorias, e-mail e plano." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <ProfileForm user={user} />
          <SecurityForms user={user} />
        </div>
        <div className="space-y-4">
          {user.email_verified && <>
            <ListEditor key={`s-${user.income_sources.length}-${user.vehicle_type}`} title="Fontes de faturamento" kind="sources" items={user.income_sources} testId="settings-sources" />
            <ListEditor key={`c-${user.expense_categories.length}-${user.vehicle_type}`} title="Categorias de despesa" kind="categories" items={user.expense_categories} testId="settings-categories" />
          </>}
          <Panel title="Plano" testId="settings-plans">
            <div className="grid gap-3 sm:grid-cols-2">
              {(plans.data?.plans ?? []).map((p) => (
                <div key={p.id} className={cn("rounded-lg border p-4", plans.data?.current === p.id && "border-primary bg-primary/5")} data-testid={`plan-card-${p.id}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-heading font-semibold">{p.name}</p>
                    {plans.data?.current === p.id && <Badge className="bg-primary/15 text-primary">atual</Badge>}
                  </div>
                  <p className="mt-1 font-mono text-lg tabular-nums">{p.price_cents ? `${money(p.price_cents)}/mês` : "Grátis"}</p>
                  {p.trial_days > 0 && <p className="text-xs text-muted-foreground">{p.trial_days} dias de teste</p>}
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{p.features.map((f) => <li key={f}>• {f}</li>)}</ul>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground" data-testid="plans-billing-note">Para assinar, use o checkout seguro. O cartão não é armazenado pelo MotorCaixa.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
