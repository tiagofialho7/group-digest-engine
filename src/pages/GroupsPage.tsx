import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useEvolutionConfig } from "@/hooks/useEvolutionConfig";
import { PROSPECTION_STAGES } from "@/lib/prospection-stages";
import { Loader2, MessageSquare, Check, Search, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface WhatsAppGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl?: string;
}

interface ProspectionSetup {
  prospect_name: string;
  prospect_company: string;
  initial_stage: string;
  priority: string;
}

export default function GroupsPage() {
  const { org } = useOrganization();
  const { config: evolutionConfig } = useEvolutionConfig(org?.id);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [monitoredIds, setMonitoredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<WhatsAppGroup | null>(null);
  const [setup, setSetup] = useState<ProspectionSetup>({
    prospect_name: "",
    prospect_company: "",
    initial_stage: "pre_qualification",
    priority: "normal",
  });
  const [saving, setSaving] = useState(false);

  // Fetch master instance name
  const [instanceName, setInstanceName] = useState<string | null>(null);

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

  useEffect(() => {
    if (!org || !evolutionConfig || !instanceName) {
      setLoading(false);
      return;
    }

    const fetchGroups = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: existingGroups } = await supabase
          .from("prospection_groups")
          .select("whatsapp_group_id")
          .eq("org_id", org.id)
          .eq("is_active", true);

        if (existingGroups) {
          setMonitoredIds(new Set(existingGroups.map((g: any) => g.whatsapp_group_id)));
        }

        const response = await fetch(
          `${evolutionConfig.api_url}/group/fetchAllGroups/${instanceName}?getParticipants=false`,
          {
            headers: {
              apikey: evolutionConfig.api_key,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) throw new Error("Falha ao buscar grupos");

        const data = await response.json();
        const parsed: WhatsAppGroup[] = (Array.isArray(data) ? data : []).map((g: any) => ({
          id: g.id,
          subject: g.subject || g.name || "Sem nome",
          size: g.size || 0,
          pictureUrl: g.pictureUrl,
        }));

        setGroups(parsed);
      } catch (err: any) {
        setError(err.message || "Erro ao buscar grupos");
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [org, evolutionConfig, instanceName]);

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

      setMonitoredIds(prev => new Set([...prev, selectedGroup.id]));
      setSelectedGroup(null);
      setSetup({ prospect_name: "", prospect_company: "", initial_stage: "pre_qualification", priority: "normal" });
      toast.success("Grupo adicionado ao pipeline!");
    } catch {
      toast.error("Erro ao ativar monitoramento");
    } finally {
      setSaving(false);
    }
  };

  const filtered = groups.filter(g =>
    g.subject.toLowerCase().includes(search.toLowerCase())
  );

  if (!evolutionConfig) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto animate-fade-in">
        <h1 className="text-xl font-bold text-foreground tracking-tight mb-6">Grupos do WhatsApp</h1>
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <WifiOff className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Configure a Evolution API nas Configurações para listar os grupos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Grupos do WhatsApp</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Selecione grupos para monitorar como prospecção</p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-3 py-1">
          {monitoredIds.size} ativos
        </span>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar grupo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(group => {
            const isMonitored = monitoredIds.has(group.id);
            return (
              <div
                key={group.id}
                className={`rounded-lg border p-3 flex items-center gap-3 transition-colors ${
                  isMonitored
                    ? "border-primary/20 bg-primary/5"
                    : "border-border bg-card hover:border-primary/20"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {group.pictureUrl ? (
                    <img src={group.pictureUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{group.subject}</p>
                  <p className="text-[10px] text-muted-foreground">{group.size} participantes</p>
                </div>
                {isMonitored ? (
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Check className="h-3 w-3" /> Ativo
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setSelectedGroup(group)}
                  >
                    Monitorar
                  </Button>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum grupo encontrado</p>
          )}
        </div>
      )}

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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              Ativar Monitoramento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
