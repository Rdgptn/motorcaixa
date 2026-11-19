import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import type { MessageOut } from "@/lib/types";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const m = useMutation({ mutationFn: () => apiPost<MessageOut>("/auth/forgot-password", { email }) });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <AuthLayout title="Recuperar senha" subtitle="Enviaremos um link válido por 60 minutos.">
      {m.isSuccess ? (
        <div className="space-y-4 rounded-xl border bg-card p-6" data-testid="forgot-success">
          <p>{m.data.message}</p>
          <Link to="/entrar" className="text-primary hover:underline" data-testid="forgot-back-login">Voltar ao login</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" data-testid="forgot-form">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail da conta</Label>
            <Input id="email" type="email" required className="h-12" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email-input" />
          </div>
          {m.isError && <p role="alert" className="text-sm text-red-300" data-testid="forgot-error">{errorMessage(m.error)}</p>}
          <Button type="submit" className="h-12 w-full" disabled={m.isPending} data-testid="forgot-submit-button">
            {m.isPending && <Loader2 className="size-4 animate-spin" />} Enviar link
          </Button>
          <Link to="/entrar" className="block text-center text-sm text-primary hover:underline">Voltar ao login</Link>
        </form>
      )}
    </AuthLayout>
  );
}
