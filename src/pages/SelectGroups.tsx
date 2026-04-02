import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Check, Search, Users, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";

interface EvolutionGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl?: string | null;
}

export default function SelectGroups() {
  const { org, isAdmin } = useOrganization();
  const [search, setSearch] = useState("");
  const [monitoredIds, setMonitoredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [addingManual, setAddingManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualGroupId, setManualGroupId] = useState("");

  const [evolutionGroups, setEvolutionGroups] = useState<EvolutionGroup[]>([]);
  const [fetchingGroups, setFetchingGroups] = useState(false);
  const [fetchingPictures, setFetchingPictures] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const hasFetchedPictures = useRef(false);

  useEffect(() => {
    if (!org) return;
    const load = async () => {
      const { data } = await supabase
        .from("monitored_groups")
        .select("whatsapp_group_id")
        .eq("org_id", org.id);
      if (data) setMonitoredIds(new Set(data.map(g => g.whatsapp_group_id)));
      setLoading(false);
    };
    load();
  }, [org]);

  useEffect(() => {
    if (!org || loading) return;
    fetchEvolutionGroups();
  }, [org, loading]);

  const fetchEvolutionGroups = async () => {
    if (!org) return;
    setFetchingGroups(true);
    setFetchError(null);
    hasFetchedPictures.current = false;
    try {
      const { data, error } = await supabase.functions.invoke('list-evolution-groups', {
        body: { org_id: org.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro desconhecido');
      setEvolutionGroups(data.groups || []);
      // Fetch pictures in background
      fetchPictures();
    } catch (err: any) {
      console.warn('[SelectGroups] fetch error:', err);
      setFetchError(err.message || 'Erro ao buscar grupos');
    } finally {
      setFetchingGroups(false);
    }
  };

  const fetchPictures = async () => {
    if (!org || hasFetchedPictures.current) return;
    hasFetchedPictures.current = true;
    setFetchingPictures(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-evolution-groups', {
        body: { org_id: org.id, include_pictures: true },
      });
      if (error || !data?.success) return;
      setEvolutionGroups(data.groups || []);
    } catch {
      // silently fail for pictures
    } finally {
      setFetchingPictures(false);
    }
  };

  const addGroupFromEvolution = async (group: EvolutionGroup) => {
    if (!org) return;
    setAddingGroupId(group.id);
    try {
      const { error } = await supabase.from("monitored_groups").insert({
        org_id: org.id,
        whatsapp_group_id: group.id,
        name: group.subject,
        participant_count: group.size,
      });
      if (error) throw error;
      setMonitoredIds(prev => new Set([...prev, group.id]));
      toast.success(`"${group.subject}" adicionado!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddingGroupId(null);
    }
  };

  const addGroup = async () => {
    if (!org || !manualName.trim() || !manualGroupId.trim()) return;
    try {
      await supabase.from("monitored_groups").insert({
        org_id: org.id,
        whatsapp_group_id: manualGroupId.trim(),
        name: manualName.trim(),
        participant_count: 0,
      });
      setMonitoredIds(prev => new Set([...prev, manualGroupId.trim()]));
      setManualName("");
      setManualGroupId("");
      setAddingManual(false);
      toast.success("Grupo adicionado!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredGroups = evolutionGroups.filter(g =>
    g.subject.toLowerCase().includes(search.toLowerCase()) ||
    g.id.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <h1 className="text-2xl font-bold text-foreground tracking-tight mb-1">Selecionar Grupos</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Selecione os grupos do WhatsApp para monitoramento
      </p>

      {/* Search + Refresh */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar grupo..."
            className="w-full bg-secondary border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchEvolutionGroups}
          disabled={fetchingGroups}
        >
          <RefreshCw className={`h-4 w-4 ${fetchingGroups ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="glass-panel rounded-xl p-4 mb-4 border-destructive/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-foreground font-medium mb-1">Não foi possível buscar grupos</p>
              <p className="text-xs text-muted-foreground">{fetchError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Groups list */}
      {fetchingGroups && evolutionGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Buscando grupos da instância mãe...</p>
        </div>
      ) : filteredGroups.length > 0 ? (
        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground mb-2">{filteredGroups.length} grupo(s) encontrados</p>
            {fetchingPictures && <Loader2 className="h-3 w-3 text-muted-foreground animate-spin mb-2" />}
          </div>
          {filteredGroups.map(group => {
            const isMonitored = monitoredIds.has(group.id);
            const isAdding = addingGroupId === group.id;
            const initials = group.subject.slice(0, 2).toUpperCase();
            return (
              <div
                key={group.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  isMonitored
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border bg-card hover:bg-accent/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-9 w-9 shrink-0">
                    {group.pictureUrl && <AvatarImage src={group.pictureUrl} alt={group.subject} />}
                    <AvatarFallback className={`text-xs font-medium ${isMonitored ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{group.subject}</p>
                    <p className="text-xs text-muted-foreground">{group.size} participantes</p>
                  </div>
                </div>
                {isMonitored ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 shrink-0">
                    <Check className="h-3 w-3" /> Monitorado
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addGroupFromEvolution(group)}
                    disabled={isAdding}
                    className="shrink-0 gap-1"
                  >
                    {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Adicionar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : !fetchingGroups && !fetchError && evolutionGroups.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum grupo encontrado na instância mãe</p>
          <p className="text-xs mt-1">Verifique se a instância está conectada e participa de grupos</p>
        </div>
      ) : null}

      {/* Manual add fallback */}
      <div className="border-t border-border pt-4 mt-4">
        {!addingManual ? (
          <Button onClick={() => setAddingManual(true)} variant="ghost" className="gap-2 text-muted-foreground">
            <Plus className="h-4 w-4" /> Adicionar manualmente
          </Button>
        ) : (
          <div className="glass-panel rounded-xl p-5 animate-fade-in">
            <h3 className="text-sm font-semibold text-foreground mb-3">Adicionar Manualmente</h3>
            <div className="grid gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do Grupo</label>
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Ex: Mentoria Avançada"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ID do Grupo WhatsApp</label>
                <input
                  value={manualGroupId}
                  onChange={(e) => setManualGroupId(e.target.value)}
                  placeholder="Ex: 120363001234567890@g.us"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={addGroup} size="sm" className="gap-1">
                  <Check className="h-3.5 w-3.5" /> Adicionar
                </Button>
                <Button onClick={() => setAddingManual(false)} size="sm" variant="outline">
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {monitoredIds.size > 0 && (
        <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm font-medium text-foreground">
            {monitoredIds.size} grupo(s) monitorados
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Volte ao Dashboard para ver seus grupos e gerar análises.
          </p>
        </div>
      )}
    </div>
  );
}
