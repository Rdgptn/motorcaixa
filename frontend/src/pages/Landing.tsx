import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Bike, CalendarDays, Car, FileSpreadsheet, LineChart, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/AuthLayout";
import { buttonVariants } from "@/components/ui/button";
import { useMe } from "@/lib/hooks";

const HERO = "https://images.unsplash.com/photo-1584310881889-93bc9c4577ff?crop=entropy&cs=srgb&fm=jpg&q=70&w=1400";
const MOTO = "https://images.unsplash.com/photo-1607273685680-6bd976c5a5ce?crop=entropy&cs=srgb&fm=jpg&q=70&w=900";

const FEATURES = [
  { icon: CalendarDays, title: "Calendário de ganhos", text: "Lance o dia por plataforma e veja na hora o total. Folga é folga; dia sem registro fica marcado." },
  { icon: LineChart, title: "Dashboard do mês", text: "Faturamento, despesas e resultado estimado, com comparação ao mês anterior." },
  { icon: FileSpreadsheet, title: "Excel no dia 1º", text: "Todo começo de mês, a planilha do mês fechado chega no seu e-mail confirmado." },
  { icon: ShieldCheck, title: "Privacidade real", text: "Cada conta só enxerga os próprios dados. Isso é verificado no servidor, em cada pedido." },
];

export default function Landing() {
  const me = useMe();
  if (me.data) return <Navigate to="/app" replace />;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Logo />
          <nav className="flex items-center gap-2">
            <Link to="/entrar" className={buttonVariants({ variant: "ghost" })} data-testid="landing-login-link">Entrar</Link>
            <Link to="/cadastro" className={buttonVariants()} data-testid="landing-signup-link">Criar conta</Link>
          </nav>
        </div>
      </header>
      <section className="relative overflow-hidden">
        <img src={HERO} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-16 md:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="space-y-6 animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <Car className="size-3.5" aria-hidden /> Carro <span className="text-muted-foreground">·</span> <Bike className="size-3.5" aria-hidden /> Moto
            </span>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Quanto sobrou<br />de verdade <span className="text-primary">no fim do mês?</span>
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              O MotorCaixa organiza seus ganhos de Uber, 99, iFood e corridas particulares, desconta combustível,
              manutenção e o resto, e mostra o seu resultado real, do celular ou do computador.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/cadastro" className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base" })} data-testid="landing-hero-cta">
                Começar grátis <ArrowRight className="size-4" />
              </Link>
              <Link to="/entrar" className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 px-6 text-base" })}>Já tenho conta</Link>
            </div>
          </div>
          <div className="relative hidden lg:block">
            <img src={MOTO} alt="Entregador de moto na cidade" className="aspect-[4/5] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-border" />
            <div className="absolute -bottom-6 -left-8 w-64 rounded-xl border bg-card/90 p-4 shadow-xl backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exemplo ilustrativo</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-primary">R$ 300,00</p>
              <p className="text-xs text-muted-foreground">iFood R$ 200 · Uber R$ 60 · Particular R$ 40</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="rounded-xl border bg-card p-5 animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <f.icon className="size-6 text-primary" aria-hidden />
            <h3 className="mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </section>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        MotorCaixa · O resultado mostrado é operacional e depende dos seus lançamentos; não é apuração contábil ou fiscal.
      </footer>
    </div>
  );
}
