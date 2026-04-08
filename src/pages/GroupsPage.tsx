import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { PROSPECTION_STAGES, getStageInfo } from "@/lib/prospection-stages";
import {
  Loader2, MessageSquare, Check, Search, WifiOff, Plus, Eye, X, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";

interface WhatsAppGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl?: string | null;
}

interface MonitoredGroup {
  id: string;
  whatsapp_group_id: string;
  group_name: string;
  prospect_name: string | null;
  prospect_company: string | null;
  current_stage: string;
  priority: string;
  created_at: string;
  is_active: boolean;
}

interface ProspectionSetup {
  prospect_name: string;
  prospect_company: string;
  initial_stage: string;
  priority: string;
}

export default function GroupsPage() {
  const { org } = useOrganization();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [monitored, setMonitored] = useState<MonitoredGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchMonitored, setSearchMonitored] = useState("");

  const [selectedGroup, setSelectedGroup] = useState<WhatsAppGroup | null>(null);
  const [setup, setSetup] = useState<ProspectionSetup>({
    prospect_name: "", prospect_company: "",
    initial_stage: "pre_qualification", priority: "normal",
  });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const monitoredIds = useMemo(
    () => new Set(monitored.filter(m => m.is_active).map(m => m.whatsapp_group_id)),
    [monitored]
  );

  const fetchMonitored = async () => {
    if (!org) return;
    const { data } = await supabase
      .from("prospection_groups")
      .select("id, whatsapp_group_id, group_name, prospect_name, prospect_company, current_stage, priority, created_at, is_active")
      .eq("org_id", org.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (data) setMonitored(data as MonitoredGroup[]);
  };

  useEffect(() => {
    if (!org) return;
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchMonitored();

        const { data, error: fnErr } = await supabase.functions.invoke("fetch-whatsapp-groups", {
          body: { orgId: org.id },
        });

        if (fnErr) throw new Error(fnErr.message);
        if (data?.error) throw new Error(data.error);

        setGroups(data?.groups || []);
      } catch (err: any) {
        setError(err.message || "Erro ao buscar grupos");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [org]);

  const handleActivate = async () => {
    if (!selectedGroup || !org) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("prospection_groups").insert({
        org_id: org.id,
        whatsapp_group_id: selectedGroup.id,
        group_name: selectedGroup.subject,
        current_stage: setup.initial_stage,
        prospect_name: setup.prospect_name || null,
        prospect_company: setup.prospect_company || null,
        priority: setup.priority,
      });
      if (error) throw error;

      await fetchMonitored();
      setSelectedGroup(null);
      setSetup({ prospect_name: "", prospect_company: "", initial_stage: "pre_qualification", priority: "normal" });
      toast.success("Grupo adicionado ao pipeline!");
    } catch {
      toast.error("Erro ao ativar monitoramento");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (group: MonitoredGroup) => {
    setRemoving(group.id);
    try {
      const { error } = await supabase
        .from("prospection_groups")
        .update({ is_active: false })
        .eq("id", group.id);
      if (error) throw error;
      await fetchMonitored();
      toast.success("Monitoramento removido");
    } catch {
      toast.error("Erro ao remover");
    } finally {
      setRemoving(null);
    }
  };

  const filteredAvailable = groups.filter(g =>
    g.subject.toLowerCase().includes(search.toLowerCase())
  );

  const filteredMonitored = monitored.filter(m =>
    (m.group_name + (m.prospect_company || "") + (m.prospect_name || ""))
      .toLowerCase()
      .includes(searchMonitored.toLowerCase())
  );

  const getDaysInStage = (createdAt: string) => {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
    return days;
  };

  if (!org) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto animate-fade-in">
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Grupos do WhatsApp</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Gerencie grupos de prospecção conectados ao WhatsApp</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Available groups */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Grupos disponíveis no WhatsApp</h2>
            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {groups.length} encontrados
            </span>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar grupo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
              <WifiOff className="h-5 w-5 text-destructive mx-auto mb-2" />
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Verifique a Evolution API nas Configurações</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
              {filteredAvailable.map(group => {
                const isMonitored = monitoredIds.has(group.id);
                return (
                  <div
                    key={group.id}
                    className={`rounded-lg border p-2.5 flex items-center gap-2.5 transition-colors ${
                      isMonitored
                        ? "border-primary/20 bg-primary/5"
                        : "border-border bg-card hover:border-primary/20"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {group.pictureUrl ? (
                        <img src={group.pictureUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{group.subject}</p>
                      <p className="text-[10px] text-muted-foreground">{group.size} participantes</p>
                    </div>
                    {isMonitored ? (
                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="h-3 w-3" /> Ativo
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 gap-1"
                        onClick={() => setSelectedGroup(group)}
                      >
                        <Plus className="h-3 w-3" /> Adicionar
                      </Button>
                    )}
                  </div>
                );
              })}
              {filteredAvailable.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum grupo encontrado</p>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — Monitored groups */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Grupos monitorados</h2>
            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {monitored.length} ativos
            </span>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar monitorado..."
              value={searchMonitored}
              onChange={(e) => setSearchMonitored(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {filteredMonitored.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <Users className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum grupo monitorado</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Adicione grupos da lista ao lado</p>
              </div>
            ) : (
              filteredMonitored.map(group => {
                const stage = getStageInfo(group.current_stage);
                const days = getDaysInStage(group.created_at);
                const isClosed = group.current_stage === "deal_won" || group.current_stage === "deal_lost";
                return (
                  <Card key={group.id} className={`border-border ${isClosed ? "bg-muted/30 opacity-60" : "bg-card"}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isClosed ? "text-muted-foreground" : "text-foreground"}`}>
                            {group.prospect_company || group.group_name}
                          </p>
                          {group.prospect_name && (
                            <p className="text-[10px] text-muted-foreground truncate">{group.prospect_name}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                              style={{
                                borderColor: stage.color,
                                color: stage.color,
                                backgroundColor: `color-mix(in srgb, ${stage.color} 10%, transparent)`,
                              }}
                            >
                              {stage.shortLabel}
                            </Badge>
                            {isClosed && (
                              <span className="text-[10px] text-muted-foreground italic">Encerrado — sem monitoramento</span>
                            )}
                            {!isClosed && group.priority === "high" && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Urgente</Badge>
                            )}
                            {!isClosed && <span className="text-[10px] text-muted-foreground">{days}d na fase</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${isClosed ? "text-muted-foreground" : ""}`}
                            onClick={() => navigate(`/prospection/${group.id}`)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemove(group)}
                            disabled={removing === group.id}
                            title="Remover monitoramento"
                          >
                            {removing === group.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Setup Modal */}
      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Configurar Prospecção</DialogTitle>
            <p className="text-xs text-muted-foreground">{selectedGroup?.subject}</p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Nome do Prospecto</label>
              <Input
                placeholder="Ex: João Silva"
                value={setup.prospect_name}
                onChange={(e) => setSetup(prev => ({ ...prev, prospect_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Empresa</label>
              <Input
                placeholder="Ex: Empresa XYZ Ltda"
                value={setup.prospect_company}
                onChange={(e) => setSetup(prev => ({ ...prev, prospect_company: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Fase Inicial</label>
              <Select value={setup.initial_stage} onValueChange={(v) => setSetup(prev => ({ ...prev, initial_stage: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROSPECTION_STAGES.map(s => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Prioridade</label>
              <Select value={setup.priority} onValueChange={(v) => setSetup(prev => ({ ...prev, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedGroup(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleActivate} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
