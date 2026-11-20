import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, CalendarDays, Home, LogOut, MailWarning, Receipt, Settings2, Shield, Bike, Car, Loader2, LockKeyhole } from "lucide-react";
import { Logo } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiError, apiPost } from "@/lib/api-client";
import { endSession } from "@/lib/auth-session";
import { errorMessage } from "@/lib/formatters";
import { useMe } from "@/lib/data-hooks";
import type { MessageOut, UserOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Início", icon: Home, end: true, id: "dashboard" },
  { to: "/app/calendario", label: "Calendário", icon: CalendarDays, id: "calendar" },
  { to: "/app/despesas", label: "Despesas", icon: Receipt, id: "expenses" },
  { to: "/app/relatorios", label: "Relatórios", icon: BarChart3, id: "reports" },
  { to: "/app/ajustes", label: "Ajustes", icon: Settings2, id: "settings" },
];

function VerifyGate({ user }: { user: UserOut }) {
  const resend = useMutation({
    mutationFn: () => apiPost<MessageOut>("/auth/resend-verification"),
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-warning/40 bg-card p-6 animate-rise" data-testid="verify-gate">
      <MailWarning className="size-10 text-warning" aria-hidden />
      <h2 className="mt-3 text-2xl font-bold">Confirme seu e-mail</h2>
      <p className="mt-2 text-muted-foreground">
        Enviamos um link para <strong className="text-foreground" data-testid="verify-gate-email">{user.email}</strong>.
        Por segurança, os lançamentos e relatórios ficam liberados só depois da confirmação. Assim, sua planilha mensal nunca vai para um endereço errado.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={() => resend.mutate()} disabled={resend.isPending} data-testid="verify-gate-resend-button">
          {resend.isPending && <Loader2 className="size-4 animate-spin" />} Reenviar link
        </Button>
        <NavLink to="/app/ajustes" className="inline-flex h-9 items-center rounded-lg border px-4 text-sm" data-testid="verify-gate-change-email">Corrigir e-mail</NavLink>
      </div>
    </div>
  );
}

function SubscriptionGate({ user }: { user: UserOut }) {
  const end = user.trial_ends_at ? new Date(user.trial_ends_at).toLocaleDateString("pt-BR") : "o fim do período gratuito";
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-primary/30 bg-card p-6 text-center animate-rise" data-testid="subscription-gate">
      <LockKeyhole className="mx-auto size-10 text-primary" aria-hidden />
      <h2 className="mt-3 text-2xl font-bold">Assinatura necessária</h2>
      <p className="mt-2 text-muted-foreground">Seu acesso gratuito terminou em <strong className="text-foreground">{end}</strong>. Ative o plano Pro para continuar usando o MotorCaixa.</p>
      <Link to="/assinar" className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground" data-testid="subscription-gate-button">Ver opções e assinar</Link>
    </div>
  );
}

export default function AppShell() {
  const me = useMe();
  const loc = useLocation();

  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/entrar" replace />;
  const user = me.data;
  const isSettings = loc.pathname.startsWith("/app/ajustes");
  const isAdminPage = loc.pathname.startsWith("/app/admin");
  const nav = user?.role === "admin" ? [...NAV, { to: "/app/admin", label: "Admin", icon: Shield, id: "admin", end: false }] : NAV;

  let content;
  if (me.isLoading) content = <div className="h-40 animate-pulse rounded-xl bg-card" data-testid="app-loading" />;
  else if (!user) content = <p className="rounded-xl border bg-card p-6 text-muted-foreground" data-testid="app-offline">Não foi possível conectar ao servidor. Tente novamente em instantes.</p>;
  else if (!user.email_verified && !isSettings && !(isAdminPage && user.role === "admin")) content = <VerifyGate user={user} />;
  else if (user.access_blocked && !isSettings) content = <SubscriptionGate user={user} />;
  else content = <Outlet />;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar p-5 md:flex" data-testid="sidebar">
        <Logo />
        {user && (
          <div className="mt-6 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            {user.vehicle_type === "moto" ? <Bike className="size-4 text-primary" /> : <Car className="size-4 text-primary" />}
            <span className="truncate font-medium">{user.vehicle_type === "moto" ? "Perfil Moto" : "Perfil Carro"}</span>
            <Badge variant="outline" className="ml-auto uppercase">{user.plan}</Badge>
          </div>
        )}
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={`sidebar-nav-${n.id}`}
              className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <n.icon className="size-4" aria-hidden /> {n.label}
            </NavLink>
          ))}
        </nav>
        <Button variant="ghost" className="justify-start text-muted-foreground" onClick={() => endSession("/entrar")} data-testid="sidebar-logout-button">
          <LogOut className="size-4" /> Sair
        </Button>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur-xl md:px-8">
          <div className="md:hidden"><Logo /></div>
          <div className="hidden md:block">
            {user && <p className="text-sm text-muted-foreground" data-testid="header-greeting">Olá, <span className="font-semibold text-foreground">{user.name.split(" ")[0]}</span></p>}
          </div>
          <div className="flex items-center gap-2">
            {user?.is_demo && <Badge className="bg-warning/15 text-warning" data-testid="demo-badge">Conta de demonstração</Badge>}
            {user?.role === "admin" && <Badge className="bg-info/15 text-info" data-testid="admin-badge">Admin</Badge>}
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Sair" onClick={() => endSession("/entrar")} data-testid="header-logout-button">
              <LogOut className="size-5" />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{content}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-[#0F172A]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }} data-testid="bottom-nav">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} data-testid={`bottom-nav-${n.id}`}
            className={({ isActive }) => cn("flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
              isActive ? "text-primary" : "text-slate-400")}>
            {({ isActive }) => (
              <>
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", isActive && "bg-primary/15")}>
                  <n.icon className="size-5" aria-hidden />
                </span>
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
