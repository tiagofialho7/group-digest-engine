import { useState, useEffect, useRef, useCallback } from "react";
import { QrCode, Loader2, Smartphone, CheckCircle, RefreshCw, Plus, Link2, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";

interface StepSendingInstanceProps {
  onInstanceConnected?: () => void;
  canCloneInstance?: boolean;
}

interface ExistingInstance {
  id: string;
  name: string;
  instance_name: string;
  status: string | null;
  is_default: boolean | null;
  phone_number: string | null;
  instance_type: string;
}

type ViewMode = "choose" | "new" | "creating" | "qrcode" | "connected" | "linking";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export function StepSendingInstance({ onInstanceConnected, canCloneInstance = true }: StepSendingInstanceProps) {
  const { org } = useOrganization();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("choose");
  const [instanceName, setInstanceName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [connectedName, setConnectedName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isFetchingQr, setIsFetchingQr] = useState(false);
  const [masterInstance, setMasterInstance] = useState<ExistingInstance | null>(null);
  const [userInstance, setUserInstance] = useState<ExistingInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkingMaster, setLinkingMaster] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!org?.id || !user?.id) return;
    const fetchInstances = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id, name, instance_name, status, is_default, phone_number, instance_type, user_id")
        .eq("org_id", org.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      const instances = data || [];
      const master = instances.find((i) => i.instance_type === "master") || null;
      const userInst = instances.find((i) => i.instance_type === "user" && i.user_id === user.id) || null;

      setMasterInstance(master);
      setUserInstance(userInst);

      if (userInst && userInst.status === "connected") {
        setConnectedName(userInst.name);
        setViewMode("connected");
      } else if (userInst && (userInst.status === "qr_required" || userInst.status === "connecting" || userInst.status === "disconnected")) {
        setConnectedName(userInst.name);
        setInstanceId(userInst.id);
        setViewMode("qrcode");
        fetchQr(userInst.id);
        startPolling(userInst.id);
      } else {
        setViewMode("choose");
      }
      setLoading(false);
    };
    fetchInstances();
  }, [org?.id, user?.id]);

  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val);
    setInstanceName(val.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, ""));
    setErrors({});
  };

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const fetchQr = useCallback(async (id: string) => {
    setIsFetchingQr(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-evolution-qrcode", { body: { instance_id: id } });
      if (error) throw error;
      if (data?.connected) {
        setQrCode(null);
        setViewMode("connected");
        stopPolling();
        onInstanceConnected?.();
      } else if (data?.qr_code) {
        setQrCode(data.qr_code);
      }
    } catch (err) {
      console.warn("QR fetch error:", err);
    } finally {
      setIsFetchingQr(false);
    }
  }, [stopPolling, onInstanceConnected]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    pollingRef.current = setInterval(() => fetchQr(id), 5000);
  }, [fetchQr, stopPolling]);

  const handleUseMasterInstance = async () => {
    if (!masterInstance || !user || !org) return;
    setLinkingMaster(true);
    setViewMode("linking");
    try {
      let apiUrl: string | undefined;
      let apiKey: string | undefined;

      const { data: vaultCheck } = await supabase.functions.invoke('manage-vault-secrets', {
        body: { action: 'check', secret_name: `whatsapp_api_url_${masterInstance.id}`, org_id: org.id },
      });

      if (!vaultCheck?.exists) {
        const { data: secrets } = await supabase
          .from("whatsapp_instance_secrets")
          .select("api_url, api_key")
          .eq("instance_id", masterInstance.id)
          .single();
        apiUrl = secrets?.api_url;
        apiKey = secrets?.api_key;
      }

      const { data, error } = await supabase.functions.invoke("create-evolution-instance", {
        body: {
          org_id: org.id,
          instance_type: "user",
          user_id: user.id,
          name: `${masterInstance.name} (Envio)`,
          instance_name: masterInstance.instance_name,
          use_existing: true,
          api_url: apiUrl,
          api_key: apiKey,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao vincular");
      
      setConnectedName(`${masterInstance.name} (Envio)`);
      setViewMode("connected");
      toast.success("Instância mãe vinculada como envio!");
      onInstanceConnected?.();
    } catch (err: any) {
      toast.error(err.message || "Erro ao vincular instância");
      setViewMode("choose");
    } finally {
      setLinkingMaster(false);
    }
  };

  const checkNameAvailability = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-instance-name', {
        body: { instance_name: instanceName, org_id: org?.id },
      });
      if (error) {
        toast.error('Erro ao verificar disponibilidade do nome');
        return false;
      }
      if (!data?.available) {
        setErrors({ instanceName: 'Este nome de instância já está em uso' });
        return false;
      }
      return true;
    } catch {
      toast.error('Erro ao verificar disponibilidade do nome');
      return false;
    }
  };

  const handleCreateInstance = async () => {
    if (!displayName.trim() || !instanceName.trim()) { toast.error("Preencha o nome da conexão"); return; }
    setIsCreating(true);

    const available = await checkNameAvailability();
    if (!available) {
      setIsCreating(false);
      return;
    }

    setViewMode("creating");
    setConnectedName(displayName);
    try {
      const { data, error } = await supabase.functions.invoke("create-evolution-instance", {
        body: {
          instance_name: instanceName,
          name: displayName,
          org_id: org?.id,
          instance_type: "user",
          user_id: user?.id,
        },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Erro ao criar instância");
      setInstanceId(data.instance_id);
      if (data.qr_code) {
        setQrCode(data.qr_code);
        setViewMode("qrcode");
        startPolling(data.instance_id);
      } else {
        setViewMode("qrcode");
        await fetchQr(data.instance_id);
        startPolling(data.instance_id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro desconhecido");
      setViewMode("choose");
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <motion.div className="space-y-8" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants} className="text-center mb-8">
        <motion.div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          <Send className="w-8 h-8 text-primary" />
        </motion.div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Instância de Envio</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Configure sua instância pessoal para enviar respostas nos grupos. Você pode usar a mesma instância mãe ou criar uma nova.
        </p>
      </motion.div>

      <div className="max-w-md mx-auto">
        <AnimatePresence mode="wait">
          {viewMode === "choose" && (
            <motion.div key="choose" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
              {canCloneInstance && masterInstance && masterInstance.status === "connected" && (
                <motion.button
                  onClick={handleUseMasterInstance}
                  className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10 transition-colors text-left"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Link2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">Usar instância mãe</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Vincular <strong>{masterInstance.name}</strong> como instância de envio — sem novo QR Code
                    </p>
                  </div>
                </motion.button>
              )}

              <motion.button
                onClick={() => setViewMode("new")}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary/30 hover:bg-accent/50 transition-colors text-left"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <div className="w-10 h-10 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">Criar nova instância</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Conectar um número diferente para envio de mensagens
                  </p>
                </div>
              </motion.button>
            </motion.div>
          )}

          {viewMode === "new" && (
            <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <button onClick={() => setViewMode("choose")} className="text-xs text-primary hover:underline mb-2">
                ← Voltar para opções
              </button>
              <div className="space-y-1.5">
                <Label>Nome da Conexão</Label>
                <Input placeholder="Ex: WhatsApp Envio" value={displayName} onChange={(e) => handleDisplayNameChange(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Identificador <span className="text-muted-foreground font-normal ml-1 text-xs">(gerado automaticamente)</span></Label>
                <Input value={instanceName} readOnly className="font-mono text-sm bg-muted/50 cursor-not-allowed" />
                {errors.instanceName && <p className="text-xs text-destructive">{errors.instanceName}</p>}
              </div>
              <div className="pt-2">
                <Button onClick={handleCreateInstance} disabled={!displayName.trim() || isCreating} className="w-full gap-2">
                  {isCreating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
                  ) : (
                    <><Smartphone className="w-4 h-4" /> Criar e Conectar</>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {(viewMode === "creating" || viewMode === "linking") && (
            <motion.div key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  {viewMode === "linking" ? "Vinculando instância mãe..." : "Criando instância..."}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {viewMode === "linking" ? "Configurando a instância de envio" : "Conectando à Evolution API e gerando QR Code"}
                </p>
              </div>
            </motion.div>
          )}

          {viewMode === "qrcode" && (
            <motion.div key="qrcode" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-2">
              <div className="text-center">
                <p className="font-medium text-foreground">Escaneie o QR Code</p>
                <p className="text-sm text-muted-foreground">WhatsApp → Menu → Aparelhos Conectados → Conectar</p>
              </div>
              <div className="w-56 h-56 rounded-xl border-2 border-primary/20 bg-card flex items-center justify-center overflow-hidden">
                {isFetchingQr && !qrCode ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-xs">Gerando QR...</span>
                  </div>
                ) : qrCode ? (
                  <img src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" className="w-full h-full object-contain p-2" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <QrCode className="w-10 h-10" />
                    <span className="text-xs">QR não disponível</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" /> Aguardando conexão...
              </div>
              <Button variant="outline" className="gap-2" onClick={() => instanceId && fetchQr(instanceId)} disabled={isFetchingQr}>
                <RefreshCw className={`w-4 h-4 ${isFetchingQr ? "animate-spin" : ""}`} /> Atualizar QR
              </Button>
            </motion.div>
          )}

          {viewMode === "connected" && (
            <motion.div key="connected" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-10 gap-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
                <CheckCircle className="w-10 h-10 text-primary" />
              </motion.div>
              <div className="text-center">
                <p className="font-semibold text-foreground text-lg">Instância de Envio Configurada!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {connectedName ? <>A instância <strong>{connectedName}</strong> está pronta para envio.</> : "Instância configurada com sucesso."}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
