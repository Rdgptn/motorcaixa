import type { ReactNode, SelectHTMLAttributes } from "react";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { money, pctChange } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-rise">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" data-testid="page-title">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "positive" | "negative" | "neutral";
export function KpiCard({ label, cents, tone = "neutral", hint, prev, testId, invert = false }: {
  label: string; cents: number; tone?: Tone; hint?: string; prev?: number; testId: string; invert?: boolean;
}) {
  const change = prev !== undefined ? pctChange(cents, prev) : null;
  const good = change !== null && (invert ? change <= 0 : change >= 0);
  return (
    <div data-testid={testId} className={cn("rounded-xl border p-4 transition-colors sm:p-5",
      tone === "positive" && "border-primary/30 bg-[#064E3B]/50",
      tone === "negative" && "border-destructive/30 bg-[#7F1D1D]/40",
      tone === "neutral" && "bg-card")}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl" data-testid={`${testId}-value`}>{money(cents)}</p>
      <div className="mt-1 flex min-h-5 items-center gap-1 text-xs text-muted-foreground">
        {change !== null ? (
          <span className={cn("inline-flex items-center gap-1 font-medium", good ? "text-primary" : "text-red-300")}>
            {change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {change > 0 ? "+" : ""}{change}% vs mês anterior
          </span>
        ) : hint}
      </div>
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground" data-testid="financial-disclaimer">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      O resultado é operacional e estimado: receitas menos despesas que você registrou. Não representa lucro contábil ou fiscal.
    </p>
  );
}

export function MoneyInput({ value, onChange, testId, id, placeholder = "0,00" }: {
  value: string; onChange: (v: string) => void; testId: string; id?: string; placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input id={id} inputMode="decimal" autoComplete="off" placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        className="h-11 pl-10 font-mono tabular-nums" data-testid={testId} />
    </div>
  );
}

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn("h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&>option]:bg-card", className)}>
      {children}
    </select>
  );
}

export function EmptyState({ title, text, action, testId }: { title: string; text?: string; action?: ReactNode; testId: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center" data-testid={testId}>
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Panel({ title, children, className, action, testId }: { title?: string; children: ReactNode; className?: string; action?: ReactNode; testId?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 sm:p-5", className)} data-testid={testId}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="font-heading text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const CHART_COLORS = ["#10B981", "#38BDF8", "#F59E0B", "#F472B6", "#A78BFA", "#FB7185", "#22D3EE"];

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-card", className)} />;
}
