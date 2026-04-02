import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, CheckCircle2, XCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "needs_auth" | "set_password">("loading");
  const [message, setMessage] = useState("");
  const acceptedRef = useRef(false);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Password form
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Wait for auth session with timeout - magic links take time to process
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      // User is authenticated, proceed to accept
      if (waitTimerRef.current) {
        clearTimeout(waitTimerRef.current);
        waitTimerRef.current = null;
      }
      return;
    }

    // No user yet - wait up to 5 seconds for magic link auth to complete
    if (!waitTimerRef.current && status === "loading") {
      waitTimerRef.current = setTimeout(() => {
        // After waiting, check one more time
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            setStatus("needs_auth");
            setMessage("Você precisa estar logado para aceitar o convite.");
          }
        });
      }, 5000);
    }

    return () => {
      if (waitTimerRef.current) {
        clearTimeout(waitTimerRef.current);
        waitTimerRef.current = null;
      }
    };
  }, [authLoading, user, status]);

  // Accept invite when user is available
  useEffect(() => {
    if (authLoading || !user) return;
    if (acceptedRef.current) return;
    acceptedRef.current = true;

    const accept = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("manage-org-members", {
          body: { action: "accept", token },
        });

        if (error) throw error;
        if (data && !data.success) throw new Error(data.error);

        setStatus("set_password");
        setMessage("Convite aceito! Defina sua senha para acessar a plataforma.");
      } catch (err: any) {
        if (err.message?.includes("Já é membro") || err.message?.includes("não encontrado")) {
          setStatus("set_password");
          setMessage("Convite aceito! Defina sua senha para acessar a plataforma.");
        } else {
          setStatus("error");
          setMessage(err.message || "Erro ao aceitar convite");
        }
      }
    };

    accept();
  }, [token, user, authLoading]);

  const handleSetPassword = async () => {
    if (!password.trim()) {
      toast.error("Digite uma senha");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success("Senha definida com sucesso!");
      setStatus("success");
      setMessage("Tudo pronto! Você já faz parte da organização.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao definir senha");
    } finally {
      setSavingPassword(false);
    }
  };

  const skipPassword = () => {
    setStatus("success");
    setMessage("Convite aceito! Você já faz parte da organização.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="glass-panel rounded-xl p-8 max-w-md w-full text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
            <p className="text-foreground">Processando convite...</p>
          </>
        )}

        {status === "set_password" && (
          <>
            <KeyRound className="h-8 w-8 text-primary mx-auto" />
            <p className="text-foreground font-medium">{message}</p>
            <div className="space-y-3 text-left mt-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nova senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Confirmar senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                  placeholder="Repita a senha"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSetPassword} disabled={savingPassword} className="flex-1">
                  {savingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Definir Senha
                </Button>
                <Button variant="ghost" onClick={skipPassword} className="text-muted-foreground">
                  Pular
                </Button>
              </div>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
            <p className="text-foreground font-medium">{message}</p>
            <Button onClick={() => navigate("/")} className="mt-4">
              Ir para o Dashboard
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-foreground font-medium">{message}</p>
            <Button variant="outline" onClick={() => navigate("/")} className="mt-4">
              Voltar
            </Button>
          </>
        )}

        {status === "needs_auth" && (
          <>
            <XCircle className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-foreground font-medium">{message}</p>
            <Button onClick={() => navigate(`/auth?redirect=/invite/${token}`)} className="mt-4">
              Fazer Login
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
