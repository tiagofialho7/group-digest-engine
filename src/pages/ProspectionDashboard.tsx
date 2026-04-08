import { useEffect, useState, useMemo } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { PROSPECTION_STAGES, getStageInfo } from "@/lib/prospection-stages";
import { Loader2, AlertTriangle, TrendingUp, Users, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ProspectionGroup {
  id: string;
  group_name: string;
  current_stage: string;
  prospect_name: string | null;
  prospect_company: string | null;
  priority: string;
  last_activity_at: string | null;
  is_active: boolean;
}

function StageColumn({ stage, groups }: { stage: typeof PROSPECTION_STAGES[number]; groups: ProspectionGroup[] }) {
  const stageColor = stage.color;
  
  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] flex-1">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: `hsl(${stageColor})` }} />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider truncate">{stage.shortLabel}</span>
        <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {groups.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1 min-h-[100px]">
        {groups.length === 0 ? (
          <div className="flex-1 rounded-lg border border-dashed border-border flex items-center justify-center p-4">
            <span className="text-xs text-muted-foreground">Nenhuma prospecção</span>
          </div>
        ) : (
          groups.map(group => (
            <ProspectionCard key={group.id} group={group} stageColor={stageColor} />
          ))
        )}
      </div>
    </div>
  );
}

function ProspectionCard({ group, stageColor }: { group: ProspectionGroup; stageColor: string }) {
  const isStale = group.last_activity_at && 
    (Date.now() - new Date(group.last_activity_at).getTime()) > 48 * 60 * 60 * 1000;

  return (
    <Link 
      to={`/prospection/${group.id}`}
      className="block rounded-lg border border-border bg-card p-3 hover:border-primary/30 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {group.prospect_company || group.group_name}
        </h4>
        {isStale && (
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
        )}
      </div>
      
      {group.prospect_name && (
        <p className="text-xs text-muted-foreground truncate mb-2">{group.prospect_name}</p>
      )}

      <div className="flex items-center justify-between">
        {group.priority === "high" && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
            Urgente
          </span>
        )}
        {group.last_activity_at && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(group.last_activity_at), { addSuffix: true, locale: ptBR })}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function ProspectionDashboard() {
  const { org, loading: orgLoading } = useOrganization();
  const [groups, setGroups] = useState<ProspectionGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org) { setLoading(false); return; }

    const fetch = async () => {
      const { data } = await supabase
        .from("prospection_groups")
        .select("id, group_name, current_stage, prospect_name, prospect_company, priority, last_activity_at, is_active")
        .eq("org_id", org.id)
        .eq("is_active", true)
        .order("last_activity_at", { ascending: false });

      setGroups((data as ProspectionGroup[]) || []);
      setLoading(false);
    };

    fetch();
  }, [org]);

  const groupedByStage = useMemo(() => {
    const map = new Map<string, ProspectionGroup[]>();
    PROSPECTION_STAGES.forEach(s => map.set(s.key, []));
    groups.forEach(g => {
      const list = map.get(g.current_stage) || [];
      list.push(g);
      map.set(g.current_stage, list);
    });
    return map;
  }, [groups]);

  const stats = useMemo(() => {
    const active = groups.length;
    const stale = groups.filter(g => g.last_activity_at && (Date.now() - new Date(g.last_activity_at).getTime()) > 48 * 60 * 60 * 1000).length;
    const urgent = groups.filter(g => g.priority === "high").length;
    return { active, stale, urgent };
  }, [groups]);

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 h-full flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Pipeline de Prospecção</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Visão geral do funil comercial</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{stats.active}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ativas</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10">
            <Clock className="h-4 w-4 text-warning" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{stats.stale}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Paradas</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{stats.urgent}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Urgentes</p>
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max h-full">
          {PROSPECTION_STAGES.map(stage => (
            <StageColumn 
              key={stage.key} 
              stage={stage} 
              groups={groupedByStage.get(stage.key) || []} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}
