import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api-client";
import { beginSession } from "@/lib/auth-session";
import { errorMessage } from "@/lib/formatters";
import { useMe } from "@/lib/data-hooks";
import type { UserOut } from "@/lib/types";

export default function Login() {
  const nav = useNavigate();
  const me = useMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = useMutation({
    mutationFn: () => apiPost<UserOut>("/auth/login", { email, password }),
    onSuccess: async (u) => {
      await beginSession(u);
      toast.success(`Bem-vindo, ${u.name.split(" ")[0]}!`);
      nav(u.role === "admin" ? "/app/admin" : "/app", { replace: true });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (me.data && !login.isPending && !login.isSuccess) {
    return <Navigate to={me.data.role === "admin" ? "/app/admin" : "/app"} replace />;
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    login.mutate();
  };

  return (
    <AuthLayout title="Entrar" subtitle="Acesse seu controle financeiro.">
      <form onSubmit={submit} className="space-y-5" data-testid="login-form">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" required className="h-12" value={email}
            onChange={(e) => setEmail(e.target.value)} data-testid="login-email-input" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link to="/esqueci-senha" className="text-sm text-primary hover:underline" data-testid="login-forgot-link">Esqueci minha senha</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required className="h-12" value={password}
            onChange={(e) => setPassword(e.target.value)} data-testid="login-password-input" />
        </div>
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300" data-testid="login-error">{error}</p>}
        <Button type="submit" className="h-12 w-full text-base active:scale-[0.98] transition-transform" disabled={login.isPending} data-testid="login-submit-button">
          {login.isPending && <Loader2 className="size-4 animate-spin" />} Entrar
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-primary hover:underline" data-testid="login-signup-link">Criar conta grátis</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
