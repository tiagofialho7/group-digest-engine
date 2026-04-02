import { useState, useEffect } from "react";
import { Plus, Trash2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  groupId: string;
  orgId: string;
  isAdmin: boolean;
}

interface Rule {
  id: string;
  rule_text: string;
  group_id: string | null;
}

export function GroupRulesEditor({ groupId, orgId, isAdmin }: Props) {
  const [orgRules, setOrgRules] = useState<Rule[]>([]);
  const [groupRules, setGroupRules] = useState<Rule[]>([]);
  const [newRule, setNewRule] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("analysis_rules")
        .select("id, rule_text, group_id")
        .eq("org_id", orgId)
        .or(`group_id.is.null,group_id.eq.${groupId}`);
      if (data) {
        setOrgRules(data.filter((r: Rule) => !r.group_id));
        setGroupRules(data.filter((r: Rule) => r.group_id === groupId));
      }
    };
    fetch();
  }, [groupId, orgId]);

  const addRule = async () => {
    if (!newRule.trim()) return;
    const { data, error } = await supabase
      .from("analysis_rules")
      .insert({ org_id: orgId, group_id: groupId, rule_text: newRule.trim() })
      .select("id, rule_text, group_id")
      .single();
    if (error) { toast.error(error.message); return; }
    if (data) setGroupRules([...groupRules, data as Rule]);
    setNewRule("");
  };

  const deleteRule = async (id: string) => {
    await supabase.from("analysis_rules").delete().eq("id", id);
    setGroupRules(groupRules.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Regras de Análise</h3>
      </div>

      {orgRules.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Organização</p>
          <div className="space-y-1">
            {orgRules.map((rule) => (
              <div key={rule.id} className="bg-muted/50 rounded-md px-3 py-1.5">
                <span className="text-xs text-muted-foreground">{rule.rule_text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Este grupo</p>
        <div className="space-y-1">
          {groupRules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-1.5">
              <span className="flex-1 text-xs text-foreground">{rule.rule_text}</span>
              {isAdmin && (
                <button onClick={() => deleteRule(rule.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {groupRules.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhuma regra específica.</p>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="flex gap-2">
          <input
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRule()}
            placeholder="Nova regra..."
            className="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button onClick={addRule} size="sm" variant="outline" className="gap-1 text-xs h-7">
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}
