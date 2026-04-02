import { useState, useEffect } from "react";
import { Mail, Loader2, Check, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ResendConfigProps {
  orgId: string;
  isAdmin: boolean;
}

export function ResendConfig({ orgId, isAdmin }: ResendConfigProps) {
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("resend_configs")
        .select("api_key, from_email, from_name")
        .eq("org_id", orgId)
        .maybeSingle();
      if (data) {
        setApiKey(data.api_key);
        setFromEmail(data.from_email);
        setFromName(data.from_name);
        setHasConfig(true);
      }
      setLoading(false);
    };
    fetch();
  }, [orgId]);

  const handleSave = async () => {
    if (!apiKey.trim() || !fromEmail.trim() || !fromName.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    setSaving(true);
    try {
      if (hasConfig) {
        const { error } = await supabase
          .from("resend_configs")
          .update({
            api_key: apiKey.trim(),
            from_email: fromEmail.trim(),
            from_name: fromName.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("org_id", orgId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("resend_configs")
          .insert({
            org_id: orgId,
            api_key: apiKey.trim(),
            from_email: fromEmail.trim(),
            from_name: fromName.trim(),
          });
        if (error) throw error;
        setHasConfig(true);
      }
      toast.success("Configuração do Resend salva!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remover configuração do Resend?")) return;
    const { error } = await supabase.from("resend_configs").delete().eq("org_id", orgId);
    if (error) { toast.error(error.message); return; }
    setApiKey("");
    setFromEmail("");
    setFromName("");
    setHasConfig(false);
    toast.success("Configuração removida");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-primary" /> E-mail (Resend)
          </h2>
          <p className="text-[10px] text-muted-foreground">Envio de convites por e-mail</p>
        </div>
        {hasConfig && (
          <span className="inline-flex items-center gap-1 text-[10px] text-success font-medium">
            <Check className="h-3 w-3" /> Configurado
          </span>
        )}
      </div>

      {isAdmin ? (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wide">API Key</label>
            <div className="relative">
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type={showKey ? "text" : "password"}
                placeholder="re_xxxxxxxx"
                className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground pr-8 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wide">E-mail de envio</label>
            <input
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              type="email"
              placeholder="noreply@seudominio.com"
              className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wide">Remetente</label>
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Minha Empresa"
              className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex gap-1.5 pt-1">
            <Button onClick={handleSave} size="sm" disabled={saving} className="gap-1 text-xs h-7">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Salvar
            </Button>
            {hasConfig && (
              <Button onClick={handleDelete} size="sm" variant="outline" className="gap-1 text-xs h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" /> Remover
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {hasConfig ? "Configuração ativa. Apenas admins podem editar." : "Não configurado."}
        </p>
      )}
    </div>
  );
}
