import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Sparkles, Loader2, Clock, Settings2, ChevronDown, ChevronUp, Users, MessageSquare, ArrowLeft, Trash2, CalendarIcon, SlidersHorizontal } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateWheelPicker } from "@/components/ui/date-wheel-picker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ContextBlockCard from "@/components/ContextBlockCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useGroupPictures } from "@/hooks/useGroupPictures";
import { toast } from "sonner";
import { GroupRulesEditor } from "@/components/settings/GroupRulesEditor";
import { GroupKnowledgeSelector } from "@/components/knowledge/GroupKnowledgeSelector";

interface GroupInfo {
  id: string;
  name: string;
  participant_count: number;
  whatsapp_group_id: string;
  picture_url?: string | null;
}

interface ContextBlockData {
  id: string;
  title: string;
  summary: string;
  message_count: number;
  is_answered: boolean;
  answered_by: string | null;
  answer_summary: string | null;
  message_ids: string[];
}

export default function GroupAnalysis() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { org, isAdmin } = useOrganization();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [contextBlocks, setContextBlocks] = useState<ContextBlockData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [periodPreset, setPeriodPreset] = useState<"6h" | "12h" | "today" | "yesterday" | "custom">("today");
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [customHour, setCustomHour] = useState(0);
  const [customPopoverOpen, setCustomPopoverOpen] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const pictures = useGroupPictures(org?.id, group ? [group] : []);

  useEffect(() => {
    if (!groupId) return;
    const fetchGroup = async () => {
      const { data } = await supabase
        .from("monitored_groups")
        .select("id, name, participant_count, whatsapp_group_id, picture_url")
        .eq("id", groupId)
        .single();
      if (data) setGroup(data);

      const { data: analysis } = await supabase
        .from("analyses")
        .select("id")
        .eq("group_id", groupId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (analysis) {
        const { data: blocks } = await supabase
          .from("context_blocks")
          .select("*")
          .eq("analysis_id", analysis.id);
        if (blocks) setContextBlocks(blocks as ContextBlockData[]);
      }

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId);
      setNewMessageCount(count || 0);

      setLoading(false);
    };
    fetchGroup();
  }, [groupId]);

  const getPeriodDates = () => {
    const end = new Date();
    let start = new Date();
    if (periodPreset === "6h") {
      start = new Date(end.getTime() - 6 * 60 * 60 * 1000);
    } else if (periodPreset === "12h") {
      start = new Date(end.getTime() - 12 * 60 * 60 * 1000);
    } else if (periodPreset === "today") {
      start.setHours(0, 0, 0, 0);
    } else if (periodPreset === "yesterday") {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
    } else if (periodPreset === "custom" && customDate) {
      start = new Date(customDate);
      start.setHours(customHour, 0, 0, 0);
    }
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const handleAnalyze = async () => {
    if (!groupId || !user || !org) return;
    setIsAnalyzing(true);

    try {
      const { start, end } = getPeriodDates();

      const { data: analysis, error: analysisError } = await supabase
        .from("analyses")
        .insert({
          group_id: groupId,
          created_by: user.id,
          period_start: start,
          period_end: end,
          status: "processing",
        })
        .select()
        .single();

      if (analysisError) throw analysisError;

      const { data: rules } = await supabase
        .from("analysis_rules")
        .select("rule_text")
        .eq("org_id", org.id)
        .or(`group_id.is.null,group_id.eq.${groupId}`);

      const response = await supabase.functions.invoke("analyze-messages", {
        body: {
          group_id: groupId,
          analysis_id: analysis.id,
          period_start: start,
          period_end: end,
          custom_rules: rules?.map((r) => r.rule_text) || [],
        },
      });

      if (response.error) throw response.error;

      const { data: blocks } = await supabase
        .from("context_blocks")
        .select("*")
        .eq("analysis_id", analysis.id);
      if (blocks) setContextBlocks(blocks as ContextBlockData[]);

      toast.success("Análise concluída!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao gerar análise: " + (err.message || "Tente novamente"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupId || !group || deleteConfirm !== group.name) return;
    setDeleting(true);
    try {
      // Delete in order: context_blocks → analyses → messages → monitored_groups
      const { data: analyses } = await supabase
        .from("analyses")
        .select("id")
        .eq("group_id", groupId);

      if (analyses?.length) {
        const analysisIds = analyses.map(a => a.id);
        await supabase.from("context_blocks").delete().in("analysis_id", analysisIds);
        await supabase.from("analyses").delete().eq("group_id", groupId);
      }

      await supabase.from("messages").delete().eq("group_id", groupId);
      await supabase.from("analysis_rules").delete().eq("group_id", groupId);
      await supabase.from("group_knowledge_bases").delete().eq("group_id", groupId);
      await supabase.from("monitored_groups").delete().eq("id", groupId);

      toast.success("Grupo excluído com sucesso");
      navigate("/");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao excluir grupo: " + (err.message || "Tente novamente"));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!group) {
    return <div className="p-6 text-center text-muted-foreground">Grupo não encontrado.</div>;
  }

  const answered = contextBlocks.filter((b) => b.is_answered).length;
  const pending = contextBlocks.filter((b) => !b.is_answered).length;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-border/50">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar className="h-12 w-12 shrink-0 ring-2 ring-border/50">
            {pictures[group.id] && <AvatarImage src={pictures[group.id]!} alt={group.name} />}
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {group.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">{group.name}</h1>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {group.participant_count}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> {newMessageCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar — period + analyze */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-8 bg-muted/30 p-4 rounded-xl border border-border/50">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Preset chips */}
          {([
            { key: "6h" as const, label: "Últimas 6h" },
            { key: "12h" as const, label: "Últimas 12h" },
            { key: "today" as const, label: "Hoje" },
            { key: "yesterday" as const, label: "Ontem" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriodPreset(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                periodPreset === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted border border-border/50"
              }`}
            >
              {label}
            </button>
          ))}

          {/* Custom date picker */}
          <Popover open={customPopoverOpen} onOpenChange={setCustomPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all inline-flex items-center gap-1.5 ${
                  periodPreset === "custom"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted border border-border/50"
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" />
                {periodPreset === "custom" && customDate
                  ? `${format(customDate, "dd/MM", { locale: ptBR })} às ${customHour}h`
                  : "Personalizar"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4 z-[60] bg-popover border border-border shadow-lg" align="start">
              <p className="text-xs font-semibold text-foreground mb-1">Analisar a partir de:</p>
              <p className="text-[11px] text-muted-foreground mb-4">Selecione a data inicial — a análise vai até o momento atual.</p>
              
              <DateWheelPicker
                value={customDate || new Date()}
                onChange={(date) => { setCustomDate(date); setPeriodPreset("custom"); }}
                minYear={2020}
                maxYear={new Date().getFullYear()}
                size="sm"
                locale="pt-BR"
              />

              <div className="border-t border-border pt-3 mt-4">
                <p className="text-[11px] font-medium text-muted-foreground mb-2">Horário inicial</p>
                <div className="grid grid-cols-6 gap-1">
                  {[0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((h) => (
                    <button
                      key={h}
                      onClick={() => { setCustomHour(h); setPeriodPreset("custom"); }}
                      className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        customHour === h && periodPreset === "custom"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {h === 0 ? "00h" : `${h}h`}
                    </button>
                  ))}
                </div>
              </div>

              {customDate && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-foreground font-medium">{format(customDate, "dd 'de' MMMM yyyy", { locale: ptBR })} às {customHour}h</span> → <span className="text-foreground font-medium">agora</span>
                  </p>
                  <Button size="sm" className="w-full mt-2 text-xs h-8" onClick={() => setCustomPopoverOpen(false)}>
                    Confirmar
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <Button size="sm" onClick={handleAnalyze} disabled={isAnalyzing} className="gap-2 h-9 text-xs shadow-sm shrink-0">
          {isAnalyzing ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" /> Analisar</>
          )}
        </Button>
      </div>

      {/* Analyzing state */}
      {isAnalyzing && (
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-10 text-center animate-fade-in">
          <Loader2 className="h-6 w-6 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-sm font-medium text-foreground mb-1">Processando análise...</p>
          <p className="text-[11px] text-muted-foreground">Coletando → Filtrando → Agrupando → Resumindo</p>
        </div>
      )}

      {/* Context blocks */}
      {!isAnalyzing && contextBlocks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4 px-1">
            <p className="text-xs font-medium text-muted-foreground">
              {contextBlocks.length} discussões
              {pending > 0 && <span className="text-accent ml-1">· {pending} pendente{pending > 1 ? "s" : ""}</span>}
              {answered > 0 && <span className="text-success ml-1">· {answered} respondida{answered > 1 ? "s" : ""}</span>}
            </p>
          </div>
          {contextBlocks.map((block) => (
            <ContextBlockCard
              key={block.id}
              block={{
                id: block.id,
                title: block.title,
                summary: block.summary,
                messageCount: block.message_count,
                isAnswered: block.is_answered,
                answeredBy: block.answered_by || undefined,
                answerSummary: block.answer_summary || undefined,
                messages: [],
                timestamp: "",
              }}
              groupId={group.id}
              messageIds={block.message_ids}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isAnalyzing && contextBlocks.length === 0 && (
        <div className="rounded-xl bg-muted/30 border border-border/50 p-12 text-center max-w-md mx-auto">
          <Sparkles className="h-10 w-10 text-muted-foreground/60 mx-auto mb-4" />
          <p className="text-base font-semibold text-foreground mb-2">Nenhuma análise ainda</p>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
            Clique em "Analisar" para identificar discussões relevantes.
          </p>
          <Button size="sm" onClick={handleAnalyze} className="gap-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5" /> Analisar
          </Button>
        </div>
      )}

      {/* Settings */}
      {org && (
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen} className="mt-12">
          <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-2">
            <Settings2 className="h-4 w-4" />
            <span className="font-medium">Configurações do grupo</span>
            {settingsOpen ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <div className="rounded-lg bg-muted/30 p-3">
              <GroupKnowledgeSelector groupId={group.id} orgId={org.id} isAdmin={isAdmin} />
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <GroupRulesEditor groupId={group.id} orgId={org.id} isAdmin={isAdmin} />
            </div>

            {/* Danger Zone */}
            <div className="rounded-lg border border-destructive/30 p-4 mt-2">
              <h4 className="text-xs font-semibold text-destructive mb-1">Zona de perigo</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Ações irreversíveis para este grupo.
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => { setDeleteConfirm(""); setDeleteOpen(true); }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir grupo
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Delete Modal */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteConfirm(""); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-xl p-5 gap-0 border-border bg-card">
          <DialogHeader className="space-y-1 pb-4">
            <DialogTitle className="text-sm font-semibold text-foreground">Excluir grupo</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ao excluir <span className="font-medium text-foreground">"{group.name}"</span>, todos os dados serão removidos permanentemente — mensagens, análises, regras e bases de conhecimento vinculadas.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Digite <span className="font-medium text-foreground">{group.name}</span> para confirmar
              </label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={group.name}
                className="text-sm h-9 bg-muted/30 border-border"
                autoComplete="off"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-xs h-9"
                onClick={() => setDeleteOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1 text-xs h-9 gap-1.5"
                disabled={deleteConfirm !== group.name || deleting}
                onClick={handleDeleteGroup}
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Excluir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
