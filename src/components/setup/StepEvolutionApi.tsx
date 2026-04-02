import { useState } from "react";
import { Server, Key, Globe, CheckCircle, Loader2, AlertTriangle, Wifi } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StepEvolutionApiProps {
  apiUrl: string;
  apiKey: string;
  onApiUrlChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
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

export function StepEvolutionApi({ apiUrl, apiKey, onApiUrlChange, onApiKeyChange, orgId }: StepEvolutionApiProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const cleanEvolutionUrl = (url: string) => {
    try {
      const parsed = new URL(url.trim());
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return url.trim().replace(/\/+$/, '');
    }
  };

  const handleUrlChange = (value: string) => {
    onApiUrlChange(value);
    setTestResult(null);
  };

  const handleUrlBlur = () => {
    if (apiUrl.trim()) {
      onApiUrlChange(cleanEvolutionUrl(apiUrl));
    }
  };

  const handleTest = async () => {
    if (!apiUrl.trim() || !apiKey.trim()) {
      toast.error("Preencha URL e API Key antes de testar");
      return;
    }
    const cleanUrl = cleanEvolutionUrl(apiUrl);
    onApiUrlChange(cleanUrl);
    setIsTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-evolution-connection", {
        body: { api_url: cleanUrl, api_key: apiKey.trim() },
      });
      if (error) throw error;

      if (data?.success) {
        // Save config (api_url in table, api_key in vault)
        const { data: existing } = await supabase
          .from("evolution_api_configs")
          .select("id")
          .eq("org_id", orgId)
          .maybeSingle();

        if (existing) {
          await supabase.from("evolution_api_configs")
            .update({ api_url: apiUrl.trim(), api_key: '***vault***', is_connected: true, tested_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("evolution_api_configs")
            .insert({ org_id: orgId, api_url: apiUrl.trim(), api_key: '***vault***', is_connected: true, tested_at: new Date().toISOString() });
        }

        // Store api_key in vault
        await supabase.functions.invoke('manage-vault-secrets', {
          body: { action: 'store', secret_name: `evo_api_key_${orgId}`, secret_value: apiKey.trim(), description: 'Evolution API Key', org_id: orgId },
        });

        setTestResult({ ok: true, message: data.message || "Conexão estabelecida!" });
        toast.success("Evolution API conectada! ✅");
      } else {
        setTestResult({ ok: false, message: data?.error || "Falha na conexão" });
        toast.error(data?.error || "Falha na conexão");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setTestResult({ ok: false, message: msg });
      toast.error("Erro ao testar conexão");
    } finally {
      setIsTesting(false);
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
          <Server className="w-8 h-8 text-primary" />
        </motion.div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Evolution API</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Configure a conexão com sua Evolution API para gerenciar o WhatsApp.
        </p>
      </motion.div>

      <div className="space-y-6 max-w-md mx-auto">
        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="evoUrl" className="flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4 text-muted-foreground" />
            URL da Evolution API
          </Label>
          <Input
            id="evoUrl"
            value={apiUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            onBlur={handleUrlBlur}
            placeholder="https://sua-evolution-api.com"
            className="font-mono text-sm"
          />
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="evoKey" className="flex items-center gap-2 text-sm">
            <Key className="w-4 h-4 text-muted-foreground" />
            API Key
          </Label>
          <Input
            id="evoKey"
            type="password"
            value={apiKey}
            onChange={(e) => { onApiKeyChange(e.target.value); setTestResult(null); }}
            placeholder="Sua chave de API"
            className="font-mono text-sm"
          />
        </motion.div>

        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
              testResult.ok
                ? "bg-primary/10 border-primary/20 text-primary"
                : "bg-destructive/10 border-destructive/20 text-destructive"
            }`}
          >
            {testResult.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {testResult.message}
          </motion.div>
        )}

        <motion.div variants={itemVariants}>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || !apiUrl.trim() || !apiKey.trim()}
            className="w-full gap-2"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {isTesting ? "Testando..." : "Testar e Salvar"}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
