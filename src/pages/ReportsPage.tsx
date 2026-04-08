import { BarChart3, Clock, TrendingUp, AlertTriangle, ArrowRight } from "lucide-react";
import { PROSPECTION_STAGES } from "@/lib/prospection-stages";

const mockStageCounts = [
  { stage: "Pré-Qual", count: 42 },
  { stage: "Contato", count: 35 },
  { stage: "Visita", count: 28 },
  { stage: "Projeto", count: 18 },
  { stage: "Apresentado", count: 12 },
  { stage: "Fechado", count: 8 },
  { stage: "Perdido", count: 5 },
];

const mockAvgDays = [
  { stage: "Pré-Qual → Contato", days: 3.2 },
  { stage: "Contato → Visita", days: 5.1 },
  { stage: "Visita → Projeto", days: 7.4 },
  { stage: "Projeto → Apresentado", days: 4.8 },
  { stage: "Apresentado → Fechado", days: 12.3 },
];

const mockConversion = [
  { from: "Pré-Qual", to: "Contato", rate: 83 },
  { from: "Contato", to: "Visita", rate: 80 },
  { from: "Visita", to: "Projeto", rate: 64 },
  { from: "Projeto", to: "Apresentado", rate: 67 },
  { from: "Apresentado", to: "Fechado", rate: 40 },
];

const maxCount = Math.max(...mockStageCounts.map(s => s.count));

const staleGroups = [
  { name: "Grupo ABC Construtora", days: 5, stage: "Projeto Elaborado" },
  { name: "Grupo Tech Solutions", days: 3, stage: "Contato Realizado" },
  { name: "Grupo MegaCorp", days: 4, stage: "Projeto Apresentado" },
  { name: "Grupo Varejo Plus", days: 7, stage: "Pré-Qualificação" },
];

export default function ReportsPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Relatórios</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Métricas do funil comercial (dados ilustrativos)</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: TrendingUp, label: "Total Ativas", value: "148", color: "text-primary" },
          { icon: BarChart3, label: "Fechadas (mês)", value: "8", color: "text-success" },
          { icon: AlertTriangle, label: "Paradas >48h", value: "4", color: "text-warning" },
          { icon: Clock, label: "Tempo Médio (dias)", value: "32.8", color: "text-info" },
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
            {mockStageCounts.map((item, i) => (
              <div key={item.stage} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20 text-right shrink-0">{item.stage}</span>
                <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${(item.count / maxCount) * 100}%`,
                      backgroundColor: `hsl(${PROSPECTION_STAGES[i]?.color || "var(--primary)"})`,
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
          <div className="space-y-2">
            {staleGroups.map((g) => (
              <div key={g.name} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
                  <p className="text-[10px] text-muted-foreground">{g.stage}</p>
                </div>
                <span className="text-xs font-medium text-warning shrink-0 ml-2">{g.days}d parado</span>
              </div>
            ))}
          </div>
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
            {mockAvgDays.map((item) => (
              <div key={item.stage} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                <span className="text-xs text-foreground">{item.stage}</span>
                <span className="text-xs font-semibold text-foreground">{item.days} dias</span>
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
            {mockConversion.map((item) => (
              <div key={item.from} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-xs text-foreground">
                  <span>{item.from}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span>{item.to}</span>
                </div>
                <span className={`text-xs font-semibold ${item.rate >= 70 ? "text-success" : item.rate >= 50 ? "text-warning" : "text-destructive"}`}>
                  {item.rate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
