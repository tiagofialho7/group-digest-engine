import { useState, useEffect } from "react";
import { Key, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  orgId: string;
  isAdmin: boolean;
}

export function AnthropicConfig({ orgId, isAdmin }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("org_api_keys")
        .select("is_valid")
        .eq("org_id", orgId)
        .eq("provider", "anthropic")
        .maybeSingle();
      if (data) {
        setIsValid(data.is_valid);
        setHasKey(true);
        // Check vault
        const { data: vaultCheck } = await supabase.functions.invoke('manage-vault-secrets', {
          body: { action: 'check', secret_name: `anthropic_key_${orgId}`, org_id: orgId },
        });
        if (vaultCheck?.exists) {
          setApiKey('••••••••••••••••');
        }
      }
    };
    fetchData();
  }, [orgId]);

  const handleSave = async () => {
    if (!apiKey.trim() || apiKey === '••••••••••••••••') return;
    setSaving(true);
    try {
      // Store in vault
      await supabase.functions.invoke('manage-vault-secrets', {
        body: { action: 'store', secret_name: `anthropic_key_${orgId}`, secret_value: apiKey.trim(), description: 'Anthropic API Key', org_id: orgId },
      });

      if (hasKey) {
        const { error } = await supabase
          .from("org_api_keys")
          .update({ api_key: '***vault***', updated_at: new Date().toISOString() })
          .eq("org_id", orgId)
          .eq("provider", "anthropic");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("org_api_keys")
          .insert({ org_id: orgId, provider: "anthropic", api_key: '***vault***' });
        if (error) throw error;
        setHasKey(true);
      }
      toast.success("API Key salva no vault!");
      setIsValid(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (apiKey === '••••••••••••••••') {
      toast.error("Insira a chave antes de testar");
      return;
    }
    setTesting(true);
    try {
      const resp = await window.fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });
      const valid = resp.ok;
      setIsValid(valid);
      await supabase
        .from("org_api_keys")
        .update({ is_valid: valid, updated_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("provider", "anthropic");
      if (valid) toast.success("Conexão válida!");
      else toast.error("API Key inválida");
    } catch {
      setIsValid(false);
      toast.error("Erro ao testar conexão");
    } finally {
      setTesting(false);
    }
  };

  const maskedKey = hasKey && apiKey ? apiKey.slice(0, 10) + "•".repeat(Math.max(0, apiKey.length - 14)) + apiKey.slice(-4) : "";

  return (
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        <Key className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Anthropic</h2>
        {isValid === true && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
        {isValid === false && <XCircle className="h-3.5 w-3.5 text-destructive" />}
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">
        API Key para modelos Claude no chat com contexto
      </p>
      {isAdmin ? (
        <div className="space-y-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex gap-1.5">
            <Button onClick={handleSave} size="sm" variant="outline" disabled={saving || !apiKey.trim()} className="text-xs h-7">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
            </Button>
            <Button onClick={handleTest} size="sm" variant="outline" disabled={testing || !apiKey.trim()} className="text-xs h-7">
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Testar"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {hasKey ? `Configurada: ${maskedKey}` : "Não configurada — peça ao admin."}
        </p>
      )}
    </div>
  );
}
