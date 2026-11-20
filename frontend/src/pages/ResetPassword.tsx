import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api-client";
import { errorMessage } from "@/lib/formatters";
import type { MessageOut } from "@/lib/types";
import { passwordProblem } from "@/pages/Signup";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<MessageOut>("/auth/reset-password", { token, password }),
    onError: (e) => setError(errorMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = passwordProblem(password);
    if (p) return setError(p);
    if (password !== confirm) return setError("As senhas não conferem.");
    setError("");
    m.mutate();
  };
  return (
    <AuthLayout title="Nova senha">
      {m.isSuccess ? (
        <div className="space-y-4 rounded-xl border bg-card p-6" data-testid="reset-success">
          <p>{m.data.message}</p>
          <Link to="/entrar" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">Entrar</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" data-testid="reset-form">
          <div className="space-y-2">
            <Label htmlFor="pw">Nova senha</Label>
            <Input id="pw" type="password" className="h-12" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="reset-password-input" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw2">Confirmar nova senha</Label>
            <Input id="pw2" type="password" className="h-12" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="reset-confirm-input" />
          </div>
          {error && <p role="alert" className="text-sm text-red-300" data-testid="reset-error">{error}</p>}
          <Button type="submit" className="h-12 w-full" disabled={m.isPending || !token} data-testid="reset-submit-button">
            {m.isPending && <Loader2 className="size-4 animate-spin" />} Salvar nova senha
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
