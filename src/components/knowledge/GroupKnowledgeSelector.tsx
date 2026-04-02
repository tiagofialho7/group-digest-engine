import { useState, useEffect } from "react";
import { BookOpen, Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  groupId: string;
  orgId: string;
  isAdmin: boolean;
}

interface KB {
  id: string;
  name: string;
}

export function GroupKnowledgeSelector({ groupId, orgId, isAdmin }: Props) {
  const [allKBs, setAllKBs] = useState<KB[]>([]);
  const [linkedKBIds, setLinkedKBIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedKB, setSelectedKB] = useState<string>("");

  const fetchData = async () => {
    const [{ data: kbs }, { data: links }] = await Promise.all([
      supabase.from("knowledge_bases").select("id, name").eq("org_id", orgId),
      supabase.from("group_knowledge_bases").select("knowledge_base_id").eq("group_id", groupId),
    ]);
    setAllKBs(kbs || []);
    setLinkedKBIds((links || []).map(l => l.knowledge_base_id));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [groupId, orgId]);

  const availableKBs = allKBs.filter(kb => !linkedKBIds.includes(kb.id));
  const linkedKBs = allKBs.filter(kb => linkedKBIds.includes(kb.id));

  const handleAdd = async () => {
    if (!selectedKB) return;
    setAdding(true);
    const { error } = await supabase.from("group_knowledge_bases").insert({
      group_id: groupId,
      knowledge_base_id: selectedKB,
    });
    if (error) { toast.error("Erro ao vincular"); setAdding(false); return; }
    toast.success("Base vinculada!");
    setSelectedKB("");
    setAdding(false);
    fetchData();
  };

  const handleRemove = async (kbId: string) => {
    const { error } = await supabase
      .from("group_knowledge_bases")
      .delete()
      .eq("group_id", groupId)
      .eq("knowledge_base_id", kbId);
    if (error) { toast.error("Erro ao desvincular"); return; }
    toast.success("Base desvinculada");
    fetchData();
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Bases de Conhecimento</h3>
      </div>

      {linkedKBs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {linkedKBs.map(kb => (
            <Badge key={kb.id} variant="secondary" className="gap-1 pr-1">
              {kb.name}
              {isAdmin && (
                <button onClick={() => handleRemove(kb.id)} className="ml-1 hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {isAdmin && availableKBs.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={selectedKB} onValueChange={setSelectedKB}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecionar base..." />
            </SelectTrigger>
            <SelectContent>
              {availableKBs.map(kb => (
                <SelectItem key={kb.id} value={kb.id}>{kb.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!selectedKB || adding} className="gap-1">
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Vincular
          </Button>
        </div>
      )}

      {linkedKBs.length === 0 && availableKBs.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma base de conhecimento disponível. Crie uma em Knowledge.</p>
      )}
    </div>
  );
}
