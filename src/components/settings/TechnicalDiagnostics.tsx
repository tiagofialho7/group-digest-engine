import { Bot, Cpu, Info } from "lucide-react";

interface LlmCall {
  functionName: string;
  model: string;
  purpose: string;
  maxTokens: number | string;
  systemPromptSource: string;
}

// Estaticamente extraído do código das Edge Functions (somente leitura).
// Fontes:
// - supabase/functions/prospection-agent/index.ts (linhas 10, 289-296)
// - supabase/functions/prospection-agent-scheduler/index.ts (sem chamadas a LLM)
const LLM_CALLS: LlmCall[] = [
  {
    functionName: "prospection-agent",
    model: "claude-haiku-4-5-20251001",
    purpose:
      "Analisa mensagens recentes do grupo, decide se deve enviar mensagem, qual mensagem enviar, infere a fase do funil e gera resumo de contexto / ações pendentes / datas-chave. Única chamada ao Claude por grupo no lote.",
    maxTokens: 1000,
    systemPromptSource: "agent_instructions (configurável em Configurações → Instruções)",
  },
];

const SCHEDULER_INFO = {
  functionName: "prospection-agent-scheduler",
  callsLlm: false,
  note:
    "Não chama nenhum LLM. Apenas decide quais organizações devem rodar agora (com base em horários configurados) e dispara o prospection-agent.",
};

export function TechnicalDiagnostics() {
  const uniqueModels = Array.from(new Set(LLM_CALLS.map((c) => c.model)));
  const allSame = uniqueModels.length === 1;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Modelos LLM em uso</h3>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Informação extraída diretamente do código das Edge Functions. Somente leitura.
        </p>

        {allSame ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">
                Todas as chamadas usam o mesmo modelo:{" "}
                <span className="font-mono text-primary">{uniqueModels[0]}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {LLM_CALLS.length} chamada(s) identificada(s) no pipeline do agente.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-warning/20 bg-warning/5 p-3 text-xs text-foreground">
            Foram identificados {uniqueModels.length} modelos distintos: {uniqueModels.join(", ")}.
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Chamadas ao LLM por função
          </h3>
        </div>

        <div className="space-y-3">
          {LLM_CALLS.map((call, idx) => (
            <div
              key={idx}
              className="rounded-md border border-border bg-muted/30 p-3 space-y-2"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold text-foreground font-mono">
                  {call.functionName}
                </p>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {call.model}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-muted-foreground uppercase tracking-wider text-[9px] mb-0.5">
                    max_tokens
                  </p>
                  <p className="text-foreground font-mono">{call.maxTokens}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wider text-[9px] mb-0.5">
                    System prompt
                  </p>
                  <p className="text-foreground">{call.systemPromptSource}</p>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground uppercase tracking-wider text-[9px] mb-0.5">
                  Finalidade
                </p>
                <p className="text-[11px] text-foreground leading-relaxed">
                  {call.purpose}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            {SCHEDULER_INFO.functionName}
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground">{SCHEDULER_INFO.note}</p>
      </section>

      <p className="text-[10px] text-muted-foreground italic">
        Esta página reflete o estado atual do código. Se as Edge Functions forem alteradas,
        atualize <span className="font-mono">src/components/settings/TechnicalDiagnostics.tsx</span>.
      </p>
    </div>
  );
}
