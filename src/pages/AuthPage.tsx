import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRegistrationSetting = async () => {
      const { data } = await supabase
        .from('system_settings' as any)
        .select('registration_enabled')
        .limit(1)
        .single();
      // Se não existe row (data é null), mantém true (padrão)
      setRegistrationEnabled(data ? (data as any).registration_enabled : true);
    };
    fetchRegistrationSetting();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        if (!registrationEnabled) {
          toast.error("O registro de novos usuários está desabilitado no momento.");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu email para confirmar.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro na autenticação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-slide-up">
         <div className="flex items-center gap-3 justify-center mb-8">
           <img src={logo} alt="VIA Logo" className="h-10 w-auto" />
           <span className="text-2xl font-bold text-foreground tracking-tight">GroupLens</span>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">
            {isLogin ? "Entrar" : "Criar conta"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {isLogin ? "Acesse sua conta para continuar" : "Crie sua conta para começar"}
          </p>

          {!isLogin && registrationEnabled === false && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
              <p className="text-xs text-destructive font-medium">
                O registro de novos usuários está desabilitado no momento.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome completo</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={!isLogin}
                  disabled={!registrationEnabled}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  placeholder="Seu nome"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={loading || (!isLogin && !registrationEnabled)}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLogin ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline"
            >
              {isLogin ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
            </button>
          </div>

          {isLogin && (
            <div className="mt-2 text-center">
              <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Esqueceu a senha?
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}