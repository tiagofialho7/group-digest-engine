import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Plus, Loader2, FileText, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  file_count: number;
  group_count: number;
}

export default function KnowledgePage() {
  const { org, isAdmin } = useOrganization();
  const { user } = useAuth();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const fetchKBs = async () => {
    if (!org) return;
    const { data: kbs } = await supabase
      .from("knowledge_bases")
      .select("id, name, description, created_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    if (!kbs) { setLoading(false); return; }

    const kbIds = kbs.map(kb => kb.id);

    const { data: files } = await supabase
      .from("knowledge_files")
      .select("knowledge_base_id")
      .in("knowledge_base_id", kbIds);

    const { data: groups } = await supabase
      .from("group_knowledge_bases")
      .select("knowledge_base_id")
      .in("knowledge_base_id", kbIds);

    const fileCounts = new Map<string, number>();
    const groupCounts = new Map<string, number>();
    files?.forEach(f => fileCounts.set(f.knowledge_base_id, (fileCounts.get(f.knowledge_base_id) || 0) + 1));
    groups?.forEach(g => groupCounts.set(g.knowledge_base_id, (groupCounts.get(g.knowledge_base_id) || 0) + 1));

    setKnowledgeBases(kbs.map(kb => ({
      ...kb,
      file_count: fileCounts.get(kb.id) || 0,
      group_count: groupCounts.get(kb.id) || 0,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchKBs(); }, [org]);

  const handleCreate = async () => {
    if (!org || !user || !name.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("knowledge_bases").insert({
        org_id: org.id,
        name: name.trim(),
        description: description.trim() || null,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success("Base de conhecimento criada!");
      setName("");
      setDescription("");
      setDialogOpen(false);
      fetchKBs();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Knowledge</h1>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Nova Base
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Base de Conhecimento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Manual de Vendas" />
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva o conteúdo desta base..." rows={3} />
                </div>
                <Button onClick={handleCreate} disabled={creating || !name.trim()} className="w-full">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {knowledgeBases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-medium text-foreground mb-1">Nenhuma base de conhecimento</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
            Crie uma base para adicionar arquivos e associá-los aos seus grupos.
          </p>
          {isAdmin && (
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Criar Base
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {knowledgeBases.map(kb => (
            <Link
              key={kb.id}
              to={`/knowledge/${kb.id}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {kb.name}
                </h3>
                {kb.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{kb.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {kb.file_count > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> {kb.file_count}
                  </span>
                )}
                {kb.group_count > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> {kb.group_count}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
