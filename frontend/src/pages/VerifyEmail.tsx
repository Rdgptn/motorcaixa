import { useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect } from "react";
import AuthLayout from "@/components/layout/AuthLayout";
import { apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { MessageOut } from "@/lib/types";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const verify = useMutation({
    mutationFn: () => apiPost<MessageOut>("/auth/verify-email", { token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
  // O token é de uso único: o ref garante uma só chamada mesmo com StrictMode (efeito roda 2x em dev).
  const sent = useRef(false);
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      verify.mutate();
    }
  }, [token, verify]);

  const failed = !token || verify.isError;
  return (
    <AuthLayout title="Confirmação de e-mail">
      <div className="space-y-5 rounded-xl border bg-card p-6" data-testid="verify-email-panel">
        {verify.isPending && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" /> Validando seu link...</p>}
        {verify.isSuccess && (
          <div className="space-y-2" data-testid="verify-email-success">
            <CheckCircle2 className="size-10 text-primary" aria-hidden />
            <p className="font-semibold">{verify.data.message}</p>
          </div>
        )}
        {failed && !verify.isPending && (
          <div className="space-y-2" data-testid="verify-email-error">
            <XCircle className="size-10 text-destructive" aria-hidden />
            <p className="font-semibold">{token ? errorMessage(verify.error) : "Link incompleto."}</p>
            <p className="text-sm text-muted-foreground">Entre na sua conta para pedir um novo link de confirmação.</p>
          </div>
        )}
        <Link to="/app" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground" data-testid="verify-email-continue">Continuar</Link>
      </div>
    </AuthLayout>
  );
}
