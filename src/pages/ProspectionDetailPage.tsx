import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useEvolutionConfig } from "@/hooks/useEvolutionConfig";
import { PROSPECTION_STAGES, getStageInfo } from "@/lib/prospection-stages";
import { Loader2, ArrowLeft, ChevronDown, Clock, Bot, Save, CheckCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProspectionDetail {
  id: string;
  group_name: string;
  current_stage: string;
  prospect_name: string | null;
  prospect_company: string | null;
  priority: string;
  notes: string | null;
  last_activity_at: string | null;
  assigned_consultants: string[];
  whatsapp_group_id: string;
}

interface StageHistoryItem {
  id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

interface AgentMessage {
  id: string;
  message_text: string;
  message_type: string;
  sent_at: string;
  delivered: boolean;
}

interface WhatsAppMessage {
  key: { id: string; fromMe: boolean };
  message: { conversation?: string; extendedTextMessage?: { text?: string } };
  pushName?: string;
  messageTimestamp?: number;
}

export default function ProspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { org } = useOrganization();
  const { config: evolutionConfig } = useEvolutionConfig(org?.id);
  const [group, setGroup] = useState<ProspectionDetail | null>(null);
  const [history, setHistory] = useState<StageHistoryItem[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [whatsappMessages, setWhatsappMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [changingStage, setChangingStage] = useState(false);
  const [instanceName, setInstanceName] = useState<string | null>(null);

  // Fetch master instance
  useEffect(() => {
    if (!org) return;
    supabase.from("whatsapp_instances")
      .select("instance_name")
      .eq("org_id", org.id)
      .eq("instance_type", "master")
      .eq("status", "connected")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setInstanceName((data as any).instance_name);
      });
  }, [org]);

  const fetchData = useCallback(async () => {
    if (!id) return;

    const [groupRes, historyRes, messagesRes] = await Promise.all([
      supabase.from("prospection_groups").select("*").eq("id", id).single(),
      supabase.from("prospection_stage_history").select("*").eq("prospection_group_id", id).order("created_at", { ascending: false }),
      supabase.from("agent_messages").select("*").eq("prospection_group_id", id).order("sent_at", { ascending: false }).limit(20),
    ]);

    if (groupRes.data) {
      const g = groupRes.data as any;
      setGroup({
        id: g.id,
        group_name: g.group_name,
        current_stage: g.current_stage,
        prospect_name: g.prospect_name,
        prospect_company: g.prospect_company,
        priority: g.priority,
        notes: g.notes,
        last_activity_at: g.last_activity_at,
        assigned_consultants: g.assigned_consultants || [],
        whatsapp_group_id: g.whatsapp_group_id,
      });
      setNotes(g.notes || "");
    }

    if (historyRes.data) setHistory(historyRes.data as StageHistoryItem[]);
    if (messagesRes.data) setAgentMessages(messagesRes.data as AgentMessage[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch WhatsApp messages
  useEffect(() => {
    if (!group || !evolutionConfig || !instanceName) return;

    const fetchWhatsAppMessages = async () => {
      setLoadingMessages(true);
      try {
        const response = await fetch(
          `${evolutionConfig.api_url}/chat/findMessages/${instanceName}`,
          {
            method: "POST",
            headers: {
              apikey: evolutionConfig.api_key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              where: {
                key: { remoteJid: group.whatsapp_group_id },
              },
              limit: 30,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          setWhatsappMessages(Array.isArray(data) ? data.slice(0, 30) : []);
        }
      } catch {
        // silently fail - messages are optional
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchWhatsAppMessages();
  }, [group?.whatsapp_group_id, evolutionConfig, instanceName]);

  const handleStageChange = async (newStage: string) => {
    if (!group || newStage === group.current_stage) return;
    setChangingStage(true);
    try {
      await supabase.from("prospection_stage_history").insert({
        prospection_group_id: group.id,
        from_stage: group.current_stage,
        to_stage: newStage,
        changed_by: "manual",
      });

      await supabase.from("prospection_groups").update({
        current_stage: newStage,
        updated_at: new Date().toISOString(),
      }).eq("id", group.id);

      setGroup({ ...group, current_stage: newStage });
      await fetchData();
      toast.success("Fase atualizada!");
    } catch {
      toast.error("Erro ao atualizar fase");
    } finally {
      setChangingStage(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!group) return;
    setSavingNotes(true);
    const { error } = await supabase.from("prospection_groups").update({ notes }).eq("id", group.id);
    if (error) toast.error("Erro ao salvar notas");
    else toast.success("Notas salvas!");
    setSavingNotes(false);
  };

  const handleTogglePriority = async () => {
    if (!group) return;
    const newPriority = group.priority === "high" ? "normal" : "high";
    await supabase.from("prospection_groups").update({ priority: newPriority }).eq("id", group.id);
    setGroup({ ...group, priority: newPriority });
    toast.success(newPriority === "high" ? "Marcado como urgente" : "Prioridade normalizada");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Prospecção não encontrada.</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  const currentStageInfo = getStageInfo(group.current_stage);

  const getMessageText = (msg: WhatsAppMessage) => {
    return msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => navigate("/")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Pipeline
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground tracking-tight truncate">
              {group.prospect_company || group.group_name}
            </h1>
            {group.prospect_name && (
              <p className="text-sm text-muted-foreground">{group.prospect_name}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleTogglePriority}
              className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                group.priority === "high"
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-muted text-muted-foreground border-border hover:border-destructive/30"
              }`}
            >
              {group.priority === "high" ? "🔥 Urgente" : "Normal"}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" disabled={changingStage}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${currentStageInfo.color})` }} />
                  {currentStageInfo.label}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {PROSPECTION_STAGES.map(stage => (
                  <DropdownMenuItem key={stage.key} onClick={() => handleStageChange(stage.key)} className="text-xs gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: `hsl(${stage.color})` }} />
                    {stage.label}
                    {stage.key === group.current_stage && <CheckCircle className="h-3 w-3 ml-auto text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* WhatsApp Messages */}
        <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <MessageCircle className="h-3.5 w-3.5 text-primary" />
            Últimas Mensagens do Grupo
          </h3>

          {loadingMessages ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : whatsappMessages.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {evolutionConfig ? "Nenhuma mensagem encontrada." : "Configure a Evolution API para ver as mensagens."}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {whatsappMessages.map((msg, i) => {
                const text = getMessageText(msg);
                if (!text) return null;
                return (
                  <div key={msg.key?.id || i} className={`rounded-lg px-3 py-2 text-xs ${msg.key?.fromMe ? "bg-primary/10 ml-8" : "bg-muted/50 mr-8"}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-foreground">{msg.pushName || (msg.key?.fromMe ? "Você" : "Participante")}</span>
                      {msg.messageTimestamp && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(msg.messageTimestamp * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    <p className="text-foreground/90">{text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeline - Stage History */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-primary" />
            Histórico de Fases
          </h3>

          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma mudança registrada.</p>
          ) : (
            <div className="relative space-y-0">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
              {history.map((item) => {
                const toInfo = getStageInfo(item.to_stage);
                const fromInfo = item.from_stage ? getStageInfo(item.from_stage) : null;
                return (
                  <div key={item.id} className="relative pl-6 pb-4 last:pb-0">
                    <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-card bg-card flex items-center justify-center z-10">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${toInfo.color})` }} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        {fromInfo ? `${fromInfo.shortLabel} → ${toInfo.shortLabel}` : toInfo.label}
                      </p>
                      {item.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{item.reason}</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(item.created_at).toLocaleDateString("pt-BR")} às {new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {item.changed_by && ` · ${item.changed_by}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Agent Actions */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-primary" />
            Histórico do Agente
          </h3>

          {agentMessages.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma ação registrada.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {agentMessages.map(msg => (
                <div key={msg.id} className="rounded-lg bg-muted/50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{msg.message_type}</span>
                    <span className={`text-[10px] ${msg.delivered ? "text-success" : "text-warning"}`}>
                      {msg.delivered ? "Entregue" : "Pendente"}
                    </span>
                  </div>
                  <p className="text-xs text-foreground">{msg.message_text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(msg.sent_at).toLocaleDateString("pt-BR")} às {new Date(msg.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Notas da Prospecção</h3>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={handleSaveNotes} disabled={savingNotes}>
              {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Salvar
            </Button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Adicione notas sobre esta prospecção..."
            rows={4}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
      </div>
    </div>
  );
}
