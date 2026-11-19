import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Bike, Car, Loader2, MailCheck } from "lucide-react";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import type { MessageOut, VehicleType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "A senha precisa de pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letras e números na senha.";
  return null;
}

export default function Signup() {
  const [vehicle, setVehicle] = useState<VehicleType>("carro");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const signup = useMutation({
    mutationFn: () => apiPost<MessageOut>("/auth/signup", { name, email, password, vehicle_type: vehicle }),
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const pw = passwordProblem(password);
    if (name.trim().length < 2) return setError("Informe seu nome.");
    if (pw) return setError(pw);
    if (password !== confirm) return setError("As senhas não conferem.");
    setError("");
    signup.mutate();
  };

  if (signup.isSuccess) {
    return (
      <AuthLayout title="Confira seu e-mail" subtitle={signup.data.message}>
        <div className="space-y-5 rounded-xl border bg-card p-6" data-testid="signup-success">
          <MailCheck className="size-10 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Abra a mensagem enviada para <strong className="text-foreground">{email}</strong> e clique em
            “Confirmar meu e-mail”. O link vale por 24 horas. Não chegou? Verifique o spam ou entre na sua conta para reenviar.
          </p>
          <Link to="/entrar" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground" data-testid="signup-go-login">Ir para o login</Link>
        </div>
      </AuthLayout>
    );
  }

  const Option = ({ value, label, desc, icon: Icon }: { value: VehicleType; label: string; desc: string; icon: typeof Car }) => (
    <button type="button" onClick={() => setVehicle(value)} aria-pressed={vehicle === value} data-testid={`signup-vehicle-${value}`}
      className={cn("flex flex-1 flex-col items-start gap-1 rounded-xl border p-4 text-left transition-[border-color,background-color,transform] active:scale-[0.98]",
        vehicle === value ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted")}>
      <Icon className={cn("size-6", vehicle === value ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="font-heading font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </button>
  );

  return (
    <AuthLayout title="Criar conta" subtitle="Grátis. Leva menos de um minuto.">
      <form onSubmit={submit} className="space-y-5" data-testid="signup-form">
        <div className="space-y-2">
          <Label>Você trabalha com</Label>
          <div className="flex gap-3">
            <Option value="carro" label="Carro" desc="Uber, 99, particular" icon={Car} />
            <Option value="moto" label="Moto" desc="iFood, Uber, 99, particular" icon={Bike} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" required autoComplete="name" className="h-12" value={name} onChange={(e) => setName(e.target.value)} data-testid="signup-name-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required autoComplete="email" className="h-12" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="signup-email-input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required autoComplete="new-password" className="h-12" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="signup-password-input" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input id="confirm" type="password" required autoComplete="new-password" className="h-12" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="signup-confirm-input" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres, com letras e números.</p>
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300" data-testid="signup-error">{error}</p>}
        <Button type="submit" className="h-12 w-full text-base active:scale-[0.98] transition-transform" disabled={signup.isPending} data-testid="signup-submit-button">
          {signup.isPending && <Loader2 className="size-4 animate-spin" />} Criar conta
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta? <Link to="/entrar" className="font-semibold text-primary hover:underline" data-testid="signup-login-link">Entrar</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
