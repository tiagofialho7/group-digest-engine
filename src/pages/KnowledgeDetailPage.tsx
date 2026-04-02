import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Upload, Trash2, Loader2, FileText, BookOpen, Pencil, Check, X, Users, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";

interface KBFile {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  content_text: string | null;
  created_at: string;
}

interface LinkedGroup {
  group_id: string;
  group_name: string;
}

export default function KnowledgeDetailPage() {
  const { kbId } = useParams();
  const navigate = useNavigate();
  const { org, isAdmin } = useOrganization();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [files, setFiles] = useState<KBFile[]>([]);
  const [linkedGroups, setLinkedGroups] = useState<LinkedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchData = async () => {
    if (!kbId) return;

    const { data: kb } = await supabase
      .from("knowledge_bases")
      .select("id, name, description")
      .eq("id", kbId)
      .single();

    if (!kb) { navigate("/knowledge"); return; }
    setName(kb.name);
    setDescription(kb.description || "");

    const { data: filesData } = await supabase
      .from("knowledge_files")
      .select("id, file_name, file_size, file_type, content_text, created_at")
      .eq("knowledge_base_id", kbId)
      .order("created_at", { ascending: false });
    setFiles(filesData || []);

    const { data: links } = await supabase
      .from("group_knowledge_bases")
      .select("group_id")
      .eq("knowledge_base_id", kbId);

    if (links && links.length > 0) {
      const groupIds = links.map(l => l.group_id);
      const { data: groups } = await supabase
        .from("monitored_groups")
        .select("id, name")
        .in("id", groupIds);
      setLinkedGroups((groups || []).map(g => ({ group_id: g.id, group_name: g.name })));
    } else {
      setLinkedGroups([]);
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [kbId]);

  // Poll while any file is still processing
  useEffect(() => {
    const hasProcessing = files.some(f => !f.content_text);
    if (!hasProcessing || loading) return;
    const interval = setInterval(async () => {
      const { data: filesData } = await supabase
        .from("knowledge_files")
        .select("id, file_name, file_size, file_type, content_text, created_at")
        .eq("knowledge_base_id", kbId!)
        .order("created_at", { ascending: false });
      if (filesData) setFiles(filesData);
    }, 3000);
    return () => clearInterval(interval);
  }, [files, loading, kbId]);

  const handleSaveEdit = async () => {
    if (!kbId || !name.trim()) return;
    const { error } = await supabase
      .from("knowledge_bases")
      .update({ name: name.trim(), description: description.trim() || null })
      .eq("id", kbId);
    if (error) { toast.error("Erro ao salvar"); return; }
    toast.success("Atualizado!");
    setEditing(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !kbId || !org) return;
    setUploading(true);

    for (const file of Array.from(fileList)) {
      try {
        const filePath = `${org.id}/${kbId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("knowledge-files")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("knowledge_files").insert({
          knowledge_base_id: kbId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type || file.name.split(".").pop() || "unknown",
        });
        if (insertError) throw insertError;

        supabase.functions.invoke("extract-file-content", {
          body: { file_path: filePath, knowledge_base_id: kbId, file_name: file.name },
        }).catch(err => console.error("Extract error:", err));
      } catch (err: any) {
        toast.error(`Erro ao enviar ${file.name}: ${err.message}`);
      }
    }

    toast.success("Arquivo(s) enviado(s)!");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(false);
    fetchData();
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    setDeleting(fileId);
    const { data: fileData } = await supabase
      .from("knowledge_files")
      .select("file_path")
      .eq("id", fileId)
      .single();
    if (fileData?.file_path) {
      await supabase.storage.from("knowledge-files").remove([fileData.file_path]);
    }
    const { error } = await supabase.from("knowledge_files").delete().eq("id", fileId);
    if (error) { toast.error("Erro ao remover"); setDeleting(null); return; }
    toast.success(`${fileName} removido`);
    setDeleting(null);
    fetchData();
  };

  const handleDeleteKB = async () => {
    if (!kbId || !confirm("Tem certeza que deseja excluir esta base e todos os seus arquivos?")) return;
    const { data: allFiles } = await supabase
      .from("knowledge_files")
      .select("file_path")
      .eq("knowledge_base_id", kbId);
    if (allFiles && allFiles.length > 0) {
      await supabase.storage.from("knowledge-files").remove(allFiles.map(f => f.file_path));
    }
    const { error } = await supabase.from("knowledge_bases").delete().eq("id", kbId);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Base excluída");
    navigate("/knowledge");
  };

  const handleUnlinkGroup = async (groupId: string) => {
    if (!kbId) return;
    const { error } = await supabase
      .from("group_knowledge_bases")
      .delete()
      .eq("group_id", groupId)
      .eq("knowledge_base_id", kbId);
    if (error) { toast.error("Erro ao desvincular"); return; }
    toast.success("Grupo desvinculado");
    fetchData();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      {/* Back + Header */}
      <Link to="/knowledge" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Knowledge
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          {editing ? (
            <div className="flex-1 space-y-2">
              <Input value={name} onChange={e => setName(e.target.value)} className="text-sm font-medium" />
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição..." rows={2} className="text-xs" />
              <div className="flex gap-1.5">
                <Button size="sm" onClick={handleSaveEdit} className="gap-1 text-xs h-7"><Check className="h-3 w-3" /> Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7"><X className="h-3 w-3" /></Button>
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-foreground truncate">{name}</h1>
              {description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>}
            </div>
          )}
        </div>
        {isAdmin && !editing && (
          <div className="flex gap-1.5 shrink-0">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="gap-1 text-xs h-8">
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDeleteKB} className="gap-1 text-xs h-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Files */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Arquivos ({files.length})</p>
          {isAdmin && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.csv,.pdf,.doc,.docx"
                className="hidden"
                onChange={handleUpload}
              />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-1 text-xs h-7">
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Upload
              </Button>
            </div>
          )}
        </div>

        {files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <FileText className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Nenhum arquivo. Faça upload para começar.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {files.map(file => (
              <div key={file.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatSize(file.file_size)}
                    {file.content_text ? (
                      <span className="ml-1.5 text-emerald-500 animate-fade-in">· ✓ Vetorizado</span>
                    ) : (
                      <span className="ml-1.5 text-amber-500 inline-flex items-center gap-1">
                        · <Loader2 className="h-2.5 w-2.5 animate-spin" /> Vetorizando...
                      </span>
                    )}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors p-1"
                    onClick={() => handleDeleteFile(file.id, file.file_name)}
                    disabled={deleting === file.id}
                  >
                    {deleting === file.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Linked Groups */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Grupos vinculados ({linkedGroups.length})</p>
        {linkedGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Users className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Nenhum grupo vinculado. Associe na página do grupo.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {linkedGroups.map(g => (
              <div key={g.group_id} className="flex items-center justify-between px-4 py-2.5">
                <Link to={`/group/${g.group_id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate">
                  {g.group_name}
                </Link>
                {isAdmin && (
                  <button
                    className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors p-1 text-xs flex items-center gap-1"
                    onClick={() => handleUnlinkGroup(g.group_id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
