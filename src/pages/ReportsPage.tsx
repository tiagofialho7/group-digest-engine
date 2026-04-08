import { useState, useEffect, useMemo } from "react";
import { BarChart3, Clock, TrendingUp, AlertTriangle, ArrowRight, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { PROSPECTION_STAGES, getStageInfo } from "@/lib/prospection-stages";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PGroup = {
  id: string;
  group_name: string;
  current_stage: string;
  is_active: boolean;
  last_activity_at: string | null;
  updated_at: string;
};

type StageHistory = {
  prospection_group_id: string;
  from_stage: string | null;
  to_stage: string;
  created_at: string;
};

export default function ReportsPage() {
  const { org } = useOrganization();
  const [groups, setGroups] = useState<PGroup[]>([]);
  const [history, setHistory] = useState<StageHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");
  const [stageFilter, setStageFilter] = useState("all");

  useEffect(() => {
    if (!org?.id) return;
    const fetch = async () => {
      setLoading(true);
      const [gRes, hRes] = await Promise.all([
        supabase.from("prospection_groups").select("id, group_name, current_stage, is_active, last_activity_at, updated_at").eq("org_id", org.id),
        supabase.from("prospection_stage_history").select("prospection_group_id, from_stage, to_stage, created_at").order("created_at", { ascending: true }),
      ]);
      setGroups((gRes.data || []) as PGroup[]);
      setHistory((hRes.data || []) as StageHistory[]);
      setLoading(false);
    };
    fetch();
  }, [org?.id]);

  const periodDate = useMemo(() => {
    if (period === "all") return null;
    const d = new Date();
    d.setDate(d.getDate() - Number(period));
    return d;
  }, [period]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Filter groups by period (created_at or updated_at within range)
  const filteredGroups = useMemo(() => {
    let g = groups;
    if (stageFilter !== "all") g = g.filter(x => x.current_stage === stageFilter);
    return g;
  }, [groups, stageFilter]);

  // Filter history by period
  const filteredHistory = useMemo(() => {
    if (!periodDate) return history;
    return history.filter(h => new Date(h.created_at) >= periodDate);
  }, [history, periodDate]);

  // --- Stats ---
  const activeCount = filteredGroups.filter(g => g.is_active && g.current_stage !== "deal_won" && g.current_stage !== "deal_lost").length;

  const wonThisMonth = groups.filter(g => g.current_stage === "deal_won" && new Date(g.updated_at) >= monthStart).length;

  const staleThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const staleGroups = filteredGroups.filter(g =>
    g.is_active &&
    g.current_stage !== "deal_won" &&
    g.current_stage !== "deal_lost" &&
    g.last_activity_at &&
    new Date(g.last_activity_at) < staleThreshold
  );

  // Stage counts
  const stageCounts = useMemo(() => {
    return PROSPECTION_STAGES.map(s => ({
      stage: s.shortLabel,
      key: s.key,
      color: s.color,
      count: filteredGroups.filter(g => g.current_stage === s.key && g.is_active).length,
    }));
  }, [filteredGroups]);

  const maxCount = Math.max(1, ...stageCounts.map(s => s.count));

  // Avg time per stage transition
  const avgDays = useMemo(() => {
    const activeStages = PROSPECTION_STAGES.filter(s => s.key !== "deal_won" && s.key !== "deal_lost");
    const pairs: { from: string; to: string; fromLabel: string; toLabel: string }[] = [];
    for (let i = 0; i < activeStages.length - 1; i++) {
      pairs.push({
        from: activeStages[i].key,
        to: activeStages[i + 1].key,
        fromLabel: activeStages[i].shortLabel,
        toLabel: activeStages[i + 1].shortLabel,
      });
    }

    return pairs.map(p => {
      // Find transitions matching this pair
      const transitions = filteredHistory.filter(h => h.from_stage === p.from && h.to_stage === p.to);
      if (transitions.length === 0) return { stage: `${p.fromLabel} → ${p.toLabel}`, days: null };

      // For each transition, find the previous entry for same group to calculate duration
      let totalDays = 0;
      let count = 0;
      for (const t of transitions) {
        const prevEntries = history.filter(
          h => h.prospection_group_id === t.prospection_group_id && h.to_stage === p.from && new Date(h.created_at) < new Date(t.created_at)
        );
        if (prevEntries.length > 0) {
          const prev = prevEntries[prevEntries.length - 1];
          const diff = (new Date(t.created_at).getTime() - new Date(prev.created_at).getTime()) / (1000 * 60 * 60 * 24);
          totalDays += diff;
          count++;
        }
      }
      return { stage: `${p.fromLabel} → ${p.toLabel}`, days: count > 0 ? Math.round((totalDays / count) * 10) / 10 : null };
    });
  }, [filteredHistory, history]);

  // Total avg time
  const totalAvgDays = useMemo(() => {
    const valid = avgDays.filter(a => a.days !== null);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((s, a) => s + (a.days || 0), 0) * 10) / 10;
  }, [avgDays]);

  // Conversion rates
  const conversionRates = useMemo(() => {
    const activeStages = PROSPECTION_STAGES.filter(s => s.key !== "deal_won" && s.key !== "deal_lost");
    const pairs: { from: string; to: string; fromLabel: string; toLabel: string }[] = [];
    for (let i = 0; i < activeStages.length - 1; i++) {
      pairs.push({
        from: activeStages[i].key,
        to: activeStages[i + 1].key,
        fromLabel: activeStages[i].shortLabel,
        toLabel: activeStages[i + 1].shortLabel,
      });
    }

    return pairs.map(p => {
      const enteredFrom = filteredHistory.filter(h => h.to_stage === p.from).length;
      const movedTo = filteredHistory.filter(h => h.from_stage === p.from && h.to_stage === p.to).length;
      const rate = enteredFrom > 0 ? Math.round((movedTo / enteredFrom) * 100) : null;
      return { from: p.fromLabel, to: p.toLabel, rate };
    });
  }, [filteredHistory]);

  // Stale groups sorted by days
  const staleGroupsSorted = useMemo(() => {
    return staleGroups
      .map(g => ({
        name: g.group_name,
        days: Math.round((Date.now() - new Date(g.last_activity_at!).getTime()) / (1000 * 60 * 60 * 24)),
        stage: getStageInfo(g.current_stage).label,
      }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 10);
  }, [staleGroups]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Relatórios</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Métricas do funil comercial</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fases</SelectItem>
              {PROSPECTION_STAGES.map(s => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: TrendingUp, label: "Total Ativas", value: String(activeCount), color: "text-primary" },
          { icon: BarChart3, label: "Fechadas (mês)", value: String(wonThisMonth), color: "text-success" },
          { icon: AlertTriangle, label: "Paradas >48h", value: String(staleGroups.length), color: "text-warning" },
          { icon: Clock, label: "Tempo Médio (dias)", value: totalAvgDays !== null ? String(totalAvgDays) : "--", color: "text-info" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Bar chart */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Prospecções por Fase</h3>
          <div className="space-y-2.5">
            {stageCounts.map((item) => (
              <div key={item.key} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20 text-right shrink-0">{item.stage}</span>
                <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${(item.count / maxCount) * 100}%`,
                      backgroundColor: `hsl(${item.color})`,
                      opacity: 0.8,
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-foreground w-8">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stale groups */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            Paradas há mais de 48h
          </h3>
          {staleGroupsSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma prospecção parada</p>
          ) : (
            <div className="space-y-2">
              {staleGroupsSorted.map((g) => (
                <div key={g.name} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
                    <p className="text-[10px] text-muted-foreground">{g.stage}</p>
                  </div>
                  <span className="text-xs font-medium text-warning shrink-0 ml-2">{g.days}d parado</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Avg time per stage */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-info" />
            Tempo Médio por Etapa
          </h3>
          <div className="space-y-2">
            {avgDays.map((item) => (
              <div key={item.stage} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                <span className="text-xs text-foreground">{item.stage}</span>
                <span className="text-xs font-semibold text-foreground">
                  {item.days !== null ? `${item.days} dias` : "--"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Conversion rates */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            Taxa de Conversão
          </h3>
          <div className="space-y-2">
            {conversionRates.map((item) => (
              <div key={item.from} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-xs text-foreground">
                  <span>{item.from}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span>{item.to}</span>
                </div>
                <span className={`text-xs font-semibold ${
                  item.rate === null ? "text-muted-foreground" :
                  item.rate >= 70 ? "text-success" :
                  item.rate >= 50 ? "text-warning" : "text-destructive"
                }`}>
                  {item.rate !== null ? `${item.rate}%` : "--"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
