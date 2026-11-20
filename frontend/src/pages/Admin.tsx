import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Loader2, MoreVertical, Play, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MoneyInput, NativeSelect, PageHeader, Panel } from "@/components/finance/ui";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api-client";
import { centsToInput, dateTime, errorMessage, money, monthLabel, parseMoney, shiftMonth } from "@/lib/formatters";
import { useMe } from "@/lib/data-hooks";
import type { AdminStats, AdminUserDetail, AdminUserPatch, AdminUserRow, AuditOut, ConfigIn, DashboardOut, EmailLogOut, MessageOut, ReportRunOut } from "@/lib/types";

function Stat({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testId}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ConfigPanel() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["admin", "config"], queryFn: () => apiGet<ConfigIn>("/admin/config") });
  const [price, setPrice] = useState<string | null>(null);
  const [trial, setTrial] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => apiPut<ConfigIn>("/admin/config", { pro_price_cents: parseMoney(price ?? centsToInput(cfg.data?.pro_price_cents ?? 0)) ?? 0, trial_days: Number(trial ?? cfg.data?.trial_days ?? 0) }),
    onSuccess: () => { toast.success("Configuração de planos salva."); qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["plans"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Panel title="Planos (preço configurável)" testId="admin-config-panel">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5"><p className="text-sm">Preço Pro / mês</p><MoneyInput testId="admin-config-price-input" value={price ?? centsToInput(cfg.data?.pro_price_cents ?? 0)} onChange={setPrice} /></div>
        <div className="space-y-1.5"><p className="text-sm">Dias de teste</p><Input type="number" min={0} max={90} className="h-11" value={trial ?? String(cfg.data?.trial_days ?? 0)} onChange={(e) => setTrial(e.target.value)} data-testid="admin-config-trial-input" /></div>
        <Button className="h-11" onClick={() => save.mutate()} disabled={save.isPending || !cfg.data} data-testid="admin-config-save">Salvar</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Cobrança ainda não integrada: o plano do usuário é alterado manualmente pelo admin.</p>
    </Panel>
  );
}

export default function Admin() {
  const me = useMe();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const isAdmin = me.data?.role === "admin";
  const dash = useQuery({ queryKey: ["admin", "month"], enabled: isAdmin, queryFn: () => apiGet<DashboardOut>("/dashboard").then((d) => d.month).catch(() => new Date().toISOString().slice(0, 7)) });
  const prevMonth = dash.data ? shiftMonth(dash.data, -1) : "";
  const [batchPeriod, setBatchPeriod] = useState("");
  const period = batchPeriod || prevMonth;

  const stats = useQuery({ queryKey: ["admin", "stats"], enabled: isAdmin, queryFn: () => apiGet<AdminStats>("/admin/stats") });
  const users = useQuery({ queryKey: ["admin", "users", search], enabled: isAdmin, queryFn: () => apiGet<AdminUserRow[]>(`/admin/users?q=${encodeURIComponent(search)}`) });
  const runs = useQuery({ queryKey: ["admin", "runs"], enabled: isAdmin, queryFn: () => apiGet<ReportRunOut[]>("/admin/report-runs") });
  const emails = useQuery({ queryKey: ["admin", "emails"], enabled: isAdmin, queryFn: () => apiGet<EmailLogOut[]>("/admin/email-logs") });
  const audit = useQuery({ queryKey: ["admin", "audit"], enabled: isAdmin, queryFn: () => apiGet<AuditOut[]>("/admin/audit") });
  const detail = useQuery({ queryKey: ["admin", "detail", detailId], enabled: !!detailId, queryFn: () => apiGet<AdminUserDetail>(`/admin/users/${detailId}`) });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdminUserPatch }) => apiPatch<AdminUserRow>(`/admin/users/${id}`, body),
    onSuccess: () => { toast.success("Usuário atualizado."); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const sendOne = useMutation({
    mutationFn: (id: string) => apiPost<ReportRunOut>(`/admin/users/${id}/send-report`, { period }),
    onSuccess: (r) => { r.status === "sent" ? toast.success(`Relatório enviado (${r.email_masked}).`) : toast.error(`Não enviado: ${r.error}`); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const batch = useMutation({
    mutationFn: () => apiPost<MessageOut>("/admin/reports/run", { period }),
    onSuccess: (r) => { toast.success(r.message); setTimeout(refresh, 2500); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (me.data && !isAdmin) return <Navigate to="/app" replace />;
  const s = stats.data;
  const monthOpts = dash.data ? Array.from({ length: 12 }, (_, i) => shiftMonth(dash.data!, -i)) : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Painel administrativo" subtitle="Visão geral do sistema, usuários, envios e auditoria." />
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6" data-testid="admin-stats">
          <Stat testId="admin-stat-users" label="Usuários" value={s.users_total} />
          <Stat testId="admin-stat-verified" label="Confirmados" value={s.users_verified} />
          <Stat testId="admin-stat-vehicle" label="Carro / Moto" value={`${s.users_carro} / ${s.users_moto}`} />
          <Stat testId="admin-stat-pro" label="Plano Pro" value={s.users_pro} />
          <Stat testId="admin-stat-revenue" label="Faturamento (mês, todos)" value={money(s.revenue_month_cents)} />
          <Stat testId="admin-stat-emails" label="E-mails com falha (7d)" value={s.emails_failed_7d} />
        </div>
      )}

      <Panel title="Relatório mensal em lote" testId="admin-batch-panel">
        <div className="flex flex-col gap-2 sm:flex-row">
          <NativeSelect className="sm:w-56" value={period} onChange={(e) => setBatchPeriod(e.target.value)} data-testid="admin-batch-period">
            {monthOpts.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </NativeSelect>
          <Button className="h-11" onClick={() => batch.mutate()} disabled={!period || batch.isPending} data-testid="admin-batch-run">
            {batch.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Processar lote agora
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">O agendador faz isso sozinho no dia 1º às 08h. Rodar de novo é seguro: quem já recebeu não recebe duplicado; falhas temporárias são retentadas (até 3x).</p>
      </Panel>

      <Tabs defaultValue="users">
        <TabsList className="mb-3 flex-wrap">
          <TabsTrigger value="users" data-testid="admin-tab-users">Usuários</TabsTrigger>
          <TabsTrigger value="runs" data-testid="admin-tab-runs">Envios</TabsTrigger>
          <TabsTrigger value="emails" data-testid="admin-tab-emails">E-mails</TabsTrigger>
          <TabsTrigger value="audit" data-testid="admin-tab-audit">Auditoria</TabsTrigger>
          <TabsTrigger value="config" data-testid="admin-tab-config">Planos</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <div className="relative mb-3 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-9" data-testid="admin-users-search" />
          </div>
          <div className="rounded-xl border bg-card">
            <Table data-testid="admin-users-table">
              <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead className="hidden sm:table-cell">Perfil</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Último login</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(users.data ?? []).map((u) => (
                  <TableRow key={u.id} data-testid={`admin-user-row-${u.id}`}>
                    <TableCell>
                      <p className="font-medium">{u.name} {u.role === "admin" && <Badge className="ml-1 bg-info/15 text-info">admin</Badge>} {u.is_demo && <Badge variant="outline">demo</Badge>}</p>
                      <p className="text-xs text-muted-foreground">{u.email} · {u.email_verified ? "confirmado" : "pendente"}</p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"><span>{u.vehicle_type}</span> · <span className="uppercase">{u.plan}</span></TableCell>
                    <TableCell><Badge className={u.status === "active" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-red-300"}>{u.status === "active" ? "ativo" : "desativado"}</Badge></TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{u.last_login_at ? dateTime(u.last_login_at) : "nunca"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label="Ver detalhes" onClick={() => setDetailId(u.id)} data-testid={`admin-user-view-${u.id}`}><Eye className="size-4" /></Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Ações" data-testid={`admin-user-actions-${u.id}`} />}><MoreVertical className="size-4" /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => patch.mutate({ id: u.id, body: { status: u.status === "active" ? "disabled" : "active" } })} data-testid={`admin-user-toggle-status-${u.id}`}>{u.status === "active" ? "Desativar conta" : "Reativar conta"}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => patch.mutate({ id: u.id, body: { plan: u.plan === "pro" ? "free" : "pro" } })} data-testid={`admin-user-toggle-plan-${u.id}`}>Mudar plano para {u.plan === "pro" ? "Gratuito" : "Pro"}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => patch.mutate({ id: u.id, body: { role: u.role === "admin" ? "user" : "admin" } })} data-testid={`admin-user-toggle-role-${u.id}`}>{u.role === "admin" ? "Remover admin" : "Tornar admin"}</DropdownMenuItem>
                          {!u.email_verified && <DropdownMenuItem onClick={() => patch.mutate({ id: u.id, body: { mark_email_verified: true } })} data-testid={`admin-user-verify-${u.id}`}>Marcar e-mail como confirmado</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => sendOne.mutate(u.id)} data-testid={`admin-user-send-report-${u.id}`}>Enviar relatório de {period ? monthLabel(period) : "..."}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="runs">
          <div className="rounded-xl border bg-card">
            <Table data-testid="admin-runs-table">
              <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Período</TableHead><TableHead>Origem</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Quando</TableHead></TableRow></TableHeader>
              <TableBody>
                {(runs.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.user_name ?? "-"}<p className="text-xs text-muted-foreground">{r.email_masked}</p></TableCell>
                    <TableCell>{r.period}</TableCell><TableCell>{r.trigger}</TableCell>
                    <TableCell>{r.status}{r.error && <p className="text-xs text-muted-foreground">{r.error} · tentativas {r.attempts}</p>}</TableCell>
                    <TableCell className="hidden text-xs md:table-cell">{dateTime(r.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(runs.data ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum processamento ainda.</p>}
          </div>
        </TabsContent>
        <TabsContent value="emails">
          <div className="rounded-xl border bg-card">
            <Table data-testid="admin-emails-table">
              <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Para</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Quando</TableHead></TableRow></TableHeader>
              <TableBody>
                {(emails.data ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.kind}</TableCell><TableCell>{e.to_masked}</TableCell>
                    <TableCell><Badge className={e.status === "sent" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-red-300"}>{e.status}</Badge>{e.error && <span className="ml-1 text-xs text-muted-foreground">{e.error}</span>}</TableCell>
                    <TableCell className="hidden text-xs md:table-cell">{dateTime(e.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="p-4 text-xs text-muted-foreground">O conteúdo dos e-mails não é armazenado. “insufficient_credits” indica que a conta da plataforma precisa de créditos para enviar.</p>
          </div>
        </TabsContent>
        <TabsContent value="audit">
          <ul className="divide-y rounded-xl border bg-card text-sm" data-testid="admin-audit-list">
            {(audit.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap gap-2 px-4 py-2"><span className="font-mono text-xs">{a.action}</span><span className="text-muted-foreground">em {a.target}</span><span className="ml-auto text-xs text-muted-foreground">{a.actor_email} · {dateTime(a.created_at)}</span></li>
            ))}
            {(audit.data ?? []).length === 0 && <li className="p-4 text-muted-foreground">Sem registros.</li>}
          </ul>
        </TabsContent>
        <TabsContent value="config"><ConfigPanel /></TabsContent>
      </Tabs>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="admin-user-detail">
          <DialogHeader>
            <DialogTitle>{detail.data?.user.name ?? "Carregando..."}</DialogTitle>
            <DialogDescription>{detail.data ? `${detail.data.user.email} · resumo de ${monthLabel(detail.data.month)}` : ""}</DialogDescription>
          </DialogHeader>
          {detail.data && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <Stat testId="admin-detail-revenue" label="Faturamento" value={money(detail.data.summary.revenue_cents)} />
                <Stat testId="admin-detail-expense" label="Despesas" value={money(detail.data.summary.expense_cents)} />
                <Stat testId="admin-detail-result" label="Resultado" value={money(detail.data.summary.result_cents)} />
              </div>
              <p className="text-muted-foreground">Dias: {detail.data.summary.worked_days} trabalhados · {detail.data.summary.off_days} folga · {detail.data.summary.no_record_days} sem registro</p>
              <p className="text-xs text-muted-foreground">Acesso registrado na auditoria.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
