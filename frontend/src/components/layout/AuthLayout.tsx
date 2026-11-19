import { Link } from "react-router-dom";
import { ShieldCheck, Car, Bike, FileSpreadsheet } from "lucide-react";
import type { ReactNode } from "react";

const HERO = "https://images.unsplash.com/photo-1518783211485-10fd3bfb2ce2?crop=entropy&cs=srgb&fm=jpg&q=70&w=1400";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`} data-testid="brand-logo">
      <span className="grid size-9 place-items-center rounded-lg bg-primary font-heading text-lg font-bold text-primary-foreground">M</span>
      <span className="font-heading text-xl font-bold tracking-tight">Motor<span className="text-primary">Caixa</span></span>
    </Link>
  );
}

/** Layout das telas públicas: painel de marca à esquerda (desktop) e formulário à direita. */
export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <img src={HERO} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(11,17,30,0.96) 0%, rgba(11,17,30,0.86) 60%, rgba(6,78,59,0.72) 100%)" }} />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div className="max-w-md space-y-6">
            <h2 className="text-4xl font-bold leading-tight tracking-tight">Seu dinheiro na pista, <span className="text-primary">sob controle.</span></h2>
            <ul className="space-y-4 text-slate-300">
              <li className="flex gap-3"><Car className="mt-0.5 size-5 text-primary" aria-hidden /> Uber, 99, iFood e corridas particulares num só lugar.</li>
              <li className="flex gap-3"><Bike className="mt-0.5 size-5 text-primary" aria-hidden /> Experiência adaptada para carro ou moto.</li>
              <li className="flex gap-3"><FileSpreadsheet className="mt-0.5 size-5 text-primary" aria-hidden /> Planilha Excel do mês no seu e-mail confirmado.</li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 text-primary" aria-hidden /> Seus dados são só seus: isolamento por conta.</li>
            </ul>
          </div>
          <p className="text-xs text-slate-400">Valores calculados a partir dos seus lançamentos. Não substitui apuração contábil.</p>
        </div>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Logo className="lg:hidden" />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 animate-rise">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="auth-title">{title}</h1>
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
