import { useState, useEffect } from "react";
import { Loader2, CheckCircle, XCircle, SkipForward, ChevronDown, ChevronRight, MessageSquare, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BatchReport {
  id: string;
  execution_id: string;
  batch_number: number;
  group_name: string;
  action: string;
  message_sent: string | null;
  stage_before: string | null;
  stage_after: string | null;
  reasoning: string | null;
  processed_at: string;
}

const stageLabels: Record<string, string> = {
  pre_qualification: "Pré-Qualificação",
  contact_made: "Contato Realizado",
  visit_done: "Visita Realizada",
  project_elaborated: "Projeto Elaborado",
  project_presented: "Projeto Apresentado",
  deal_won: "Negócio Fechado",
  deal_lost: "Negócio Perdido",
};

const actionIcons: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  mensagem_enviada: { icon: MessageSquare, color: "text-emerald-500", label: "mensagem enviada" },
  sem_acao: { icon: SkipForward, color: "text-muted-foreground", label: "sem ação" },
  erro: { icon: XCircle, color: "text-destructive", label: "erro" },
};

export function AgentBatchReport({ orgId }: { orgId: string }) {
  const [reports, setReports] = useState<BatchReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set([1]));

  useEffect(() => {
    if (!orgId) return;
    fetchLatestReport();
  }, [orgId]);

  const fetchLatestReport = async () => {
    setLoading(true);
    // Get latest execution_id
    const { data: latest, error: latestErr } = await supabase
      .from("agent_batch_reports")
      .select("execution_id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      console.error("[AgentBatchReport] Error fetching latest:", latestErr);
    }

    if (!latest) {
      setLoading(false);
      return;
    }

    // Fetch all reports for that execution
    const { data, error: reportsErr } = await supabase
      .from("agent_batch_reports")
      .select("*")
      .eq("execution_id", latest.execution_id)
      .order("batch_number", { ascending: true })
      .order("processed_at", { ascending: true });

    if (reportsErr) {
      console.error("[AgentBatchReport] Error fetching reports:", reportsErr);
    }

    setReports((data as any[]) || []);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">Nenhum relatório de execução disponível.</p>
    );
  }

  // Summary
  const totalGroups = reports.length;
  const messagesSent = reports.filter(r => r.action === "mensagem_enviada").length;
  const stageChanges = reports.filter(r => r.stage_after).length;
  const errors = reports.filter(r => r.action === "erro").length;
  const firstReport = reports[0];
  const executionDate = new Date(firstReport.processed_at);

  // Group by batch
  const batches = new Map<number, BatchReport[]>();
  for (const r of reports) {
    const arr = batches.get(r.batch_number) || [];
    arr.push(r);
    batches.set(r.batch_number, arr);
  }

  const toggleBatch = (n: number) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="rounded-lg bg-muted/50 border border-border p-3">
        <p className="text-xs font-medium text-foreground">
          Execução {executionDate.toLocaleDateString("pt-BR")} às{" "}
          {executionDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          <span className="text-muted-foreground">
            {" "}— {totalGroups} grupos | {messagesSent} mensagens enviadas | {stageChanges} fases atualizadas
            {errors > 0 && ` | ${errors} erros`}
          </span>
        </p>
      </div>

      {/* Batches */}
      {Array.from(batches.entries()).map(([batchNum, items]) => {
        const isExpanded = expandedBatches.has(batchNum);
        const startIdx = (batchNum - 1) * (items.length) + 1;
        const endIdx = startIdx + items.length - 1;

        return (
          <div key={batchNum} className="rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleBatch(batchNum)}
              className="w-full flex items-center justify-between px-3 py-2 bg-card hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs font-medium text-foreground">
                LOTE {batchNum} ({items.length} grupos)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {items.filter(i => i.action === "mensagem_enviada").length} msg
                  {items.some(i => i.action === "erro") && " · " + items.filter(i => i.action === "erro").length + " erro"}
                </span>
                {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            </button>

            {isExpanded && (
              <div className="divide-y divide-border">
                {items.map((item) => {
                  const actionInfo = actionIcons[item.action] || actionIcons.sem_acao;
                  const Icon = actionInfo.icon;

                  return (
                    <div key={item.id} className="px-3 py-2 bg-card/50">
                      <div className="flex items-start gap-2">
                        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${actionInfo.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground truncate">{item.group_name}</span>
                            <span className={`text-[10px] ${actionInfo.color}`}>→ {actionInfo.label}</span>
                          </div>

                          {item.message_sent && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 italic">
                              "{item.message_sent}"
                            </p>
                          )}

                          {item.stage_after && item.stage_before && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                Fase: {stageLabels[item.stage_before] || item.stage_before}
                              </span>
                              <ArrowRight className="h-2.5 w-2.5 text-primary" />
                              <span className="text-[10px] text-primary font-medium">
                                {stageLabels[item.stage_after] || item.stage_after}
                              </span>
                            </div>
                          )}

                          {item.reasoning && (
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2">
                              {item.reasoning}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
