import { useState, useEffect } from "react";
import { Key, CheckCircle, XCircle, Loader2, Wifi } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StepAnthropicKeyProps {
  orgId: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export function StepAnthropicKey({ orgId }: StepAnthropicKeyProps) {
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("org_api_keys")
        .select("is_valid")
        .eq("org_id", orgId)
        .eq("provider", "anthropic")
        .maybeSingle();
      if (data) {
        setIsValid(data.is_valid);
        setHasKey(true);
        // Check if vault has the key
        const { data: vaultCheck } = await supabase.functions.invoke('manage-vault-secrets', {
          body: { action: 'check', secret_name: `anthropic_key_${orgId}`, org_id: orgId },
        });
        if (vaultCheck?.exists) {
          setApiKey('••••••••••••••••'); // Masked placeholder
        }
      }
    };
    load();
  }, [orgId]);

  const handleTestAndSave = async () => {
    if (!apiKey.trim() || apiKey === '••••••••••••••••') return;
    setTesting(true);
    try {
      // Test key
      const resp = await window.fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });
      const valid = resp.ok;
      setIsValid(valid);

      if (!valid) {
        toast.error("API Key inválida");
        setTesting(false);
        return;
      }

      // Store key in vault
      await supabase.functions.invoke('manage-vault-secrets', {
        body: { action: 'store', secret_name: `anthropic_key_${orgId}`, secret_value: apiKey.trim(), description: 'Anthropic API Key', org_id: orgId },
      });

      // Save metadata (without the actual key)
      if (hasKey) {
        await supabase.from("org_api_keys")
          .update({ api_key: '***vault***', is_valid: true, updated_at: new Date().toISOString() })
          .eq("org_id", orgId)
          .eq("provider", "anthropic");
      } else {
        await supabase.from("org_api_keys")
          .insert({ org_id: orgId, provider: "anthropic", api_key: '***vault***', is_valid: true });
        setHasKey(true);
      }
      toast.success("API Key Anthropic salva no vault e validada! ✅");
    } catch {
      setIsValid(false);
      toast.error("Erro ao testar conexão");
    } finally {
      setTesting(false);
    }
  };

  return (
    <motion.div className="space-y-8" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants} className="text-center mb-8">
        <motion.div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          <Key className="w-8 h-8 text-primary" />
        </motion.div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Anthropic (Claude)</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Configure a API Key da Anthropic para habilitar o chat inteligente com contexto.
        </p>
        <div className="mt-3 mx-auto max-w-md rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          <strong>Opcional:</strong> esta etapa pode ser pulada, mas configurar a Anthropic gera resultados significativamente melhores nas respostas assistidas pelo chat com contexto.
        </div>
      </motion.div>

      <div className="space-y-6 max-w-md mx-auto">
        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="anthropicKey" className="flex items-center gap-2 text-sm">
            <Key className="w-4 h-4 text-muted-foreground" />
            API Key
            {isValid === true && <CheckCircle className="w-3.5 h-3.5 text-primary ml-auto" />}
            {isValid === false && <XCircle className="w-3.5 h-3.5 text-destructive ml-auto" />}
          </Label>
          <Input
            id="anthropicKey"
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setIsValid(null); }}
            placeholder="sk-ant-..."
            className="font-mono text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Obtenha sua chave em{" "}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              console.anthropic.com
            </a>
          </p>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Button
            variant="outline"
            onClick={handleTestAndSave}
            disabled={testing || !apiKey.trim()}
            className="w-full gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {testing ? "Validando..." : "Testar e Salvar"}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
