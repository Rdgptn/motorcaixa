import { Link } from "react-router-dom";
import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/data-hooks";

export default function Subscription() {
  const { data: user } = useMe();
  const trialEnd = user?.trial_ends_at ? new Date(user.trial_ends_at).toLocaleDateString("pt-BR") : "14 dias após o cadastro";
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl border border-primary/30 bg-card p-6 text-center shadow-xl">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/15 text-primary"><LockKeyhole className="size-7" /></div>
        <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-primary">Assinatura necessária</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">Seu período grátis terminou</h1>
        <p className="mx-auto mt-3 max-w-lg text-muted-foreground">O acesso gratuito foi encerrado em <strong className="text-foreground">{trialEnd}</strong>. Para continuar usando o MotorCaixa, ative o plano Pro.</p>
        <div className="mx-auto mt-6 max-w-sm rounded-xl border bg-background p-5 text-left">
          <div className="flex items-center justify-between"><span className="font-heading text-lg font-semibold">MotorCaixa Pro</span><span className="font-mono text-primary">R$ 19,90/mês</span></div>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground"><li className="flex gap-2"><CheckCircle2 className="size-4 text-primary" />Calendário e despesas sem limite</li><li className="flex gap-2"><CheckCircle2 className="size-4 text-primary" />Relatórios e Excel mensal</li><li className="flex gap-2"><ShieldCheck className="size-4 text-primary" />Pagamento processado com segurança pelo Stripe</li></ul>
          <Button className="mt-5 h-11 w-full" onClick={() => window.location.assign("/api/billing/checkout")}>Assinar com pagamento seguro</Button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">Nenhum cartão é armazenado pelo MotorCaixa.</p>
        </div>
        <Link to="/app/ajustes" className="mt-5 inline-block text-sm text-primary hover:underline">Voltar para ajustes</Link>
      </div>
    </div>
  );
}
