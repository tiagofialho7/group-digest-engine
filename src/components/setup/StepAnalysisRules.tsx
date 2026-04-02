import { useState, useEffect } from "react";
import { Plus, Trash2, BookOpen, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  orgId: string;
}

interface Rule {
  id: string;
  rule_text: string;
}

const SUGGESTION_RULES = [
  "Foque apenas em perguntas e dúvidas dos participantes",
  "Identifique pedidos de suporte técnico e bugs reportados",
  "Capture feedbacks positivos e negativos sobre o produto",
  "Destaque decisões e ações combinadas no grupo",
  "Identifique oportunidades de venda mencionadas",
];

export function StepAnalysisRules({ orgId }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [newRule, setNewRule] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRules = async () => {
      const { data } = await supabase
        .from("analysis_rules")
        .select("id, rule_text")
        .eq("org_id", orgId)
        .is("group_id", null);
      if (data) setRules(data);
      setLoading(false);
    };
    fetchRules();
  }, [orgId]);

  const addRule = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from("analysis_rules")
      .insert({ org_id: orgId, rule_text: trimmed })
      .select("id, rule_text")
      .single();
    if (error) { toast.error(error.message); return; }
    if (data) setRules((prev) => [...prev, data as Rule]);
    setNewRule("");
  };

  const deleteRule = async (id: string) => {
    await supabase.from("analysis_rules").delete().eq("id", id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center mx-auto">
          <BookOpen className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Regras de Análise</h2>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Defina como a IA deve interpretar as mensagens dos grupos. Sem regras, o resumo será geral cobrindo todos os tipos de mensagem.
        </p>
      </div>

      {/* Current rules */}
      <div className="space-y-1.5">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
            <span className="flex-1 text-xs text-foreground">{rule.rule_text}</span>
            <button onClick={() => deleteRule(rule.id)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {!loading && rules.length === 0 && (
          <div className="text-center py-3 text-xs text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border">
            Nenhuma regra definida — o resumo será geral
          </div>
        )}
      </div>

      {/* Add new rule */}
      <div className="flex gap-2">
        <input
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRule(newRule)}
          placeholder="Escreva uma regra..."
          className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button onClick={() => addRule(newRule)} size="sm" variant="outline" className="gap-1 text-xs h-8">
          <Plus className="h-3 w-3" /> Adicionar
        </Button>
      </div>

      {/* Suggestions */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          <Lightbulb className="w-3 h-3" /> Sugestões
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTION_RULES.filter((s) => !rules.some((r) => r.rule_text === s)).map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => addRule(suggestion)}
              className="text-[10px] px-2.5 py-1 rounded-full border border-border bg-muted/30 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
