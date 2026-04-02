import { useState, useEffect } from "react";
import { Plus, Trash2, Mail, Shield, UserMinus, Crown, Loader2, Check, Link2, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";

export default function TeamPage() {
  const { user } = useAuth();
  const { org, members, isAdmin, refetch } = useOrganization();

  useEffect(() => {
    refetch();
  }, []);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!org || !isAdmin) return;
    const fetchInvites = async () => {
      const { data } = await supabase
        .from("org_invites")
        .select("*")
        .eq("org_id", org.id)
        .eq("status", "pending");
      if (data) setPendingInvites(data);
    };
    fetchInvites();
  }, [org, isAdmin]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !org || !user) return;
    setInviting(true);
    try {
      const { data: existing } = await supabase
        .from("org_invites")
        .select("id")
        .eq("org_id", org.id)
        .eq("email", inviteEmail.trim().toLowerCase())
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        toast.error("Convite já enviado para este e-mail");
        setInviting(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-org-members", {
        body: {
          action: "invite",
          org_id: org.id,
          email: inviteEmail.trim().toLowerCase(),
        },
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);

      // Copy invite link (with auth) to clipboard
      if (data?.invite_link) {
        await navigator.clipboard.writeText(data.invite_link);
        toast.success("Link de convite copiado para a área de transferência!");
      } else {
        const link = `${window.location.origin}/invite/${data?.token}`;
        await navigator.clipboard.writeText(link);
        toast.success("Link copiado (sem login automático)");
      }

      setInviteEmail("");

      const { data: invites } = await supabase
        .from("org_invites")
        .select("*")
        .eq("org_id", org.id)
        .eq("status", "pending");
      if (invites) setPendingInvites(invites);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar convite");
    } finally {
      setInviting(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    await supabase.from("org_invites").delete().eq("id", inviteId);
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    toast.success("Convite cancelado");
  };

  const copyInviteLink = async (token: string, id: string) => {
    try {
      // Regenerate the magic link for this invite
      const { data, error } = await supabase.functions.invoke("manage-org-members", {
        body: { action: "regenerate_link", token },
      });

      if (!error && data?.invite_link) {
        await navigator.clipboard.writeText(data.invite_link);
      } else {
        // Fallback to simple link
        const link = `${window.location.origin}/invite/${token}`;
        await navigator.clipboard.writeText(link);
      }

      setCopiedId(id);
      toast.success("Link copiado!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const link = `${window.location.origin}/invite/${token}`;
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      toast.success("Link copiado!");
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const updateRole = async (memberId: string, newRole: "admin" | "member") => {
    const { error } = await supabase.from("org_members").update({ role: newRole }).eq("id", memberId);
    if (error) toast.error(error.message);
    else {
      toast.success("Papel atualizado!");
      refetch();
    }
  };

  const removeMember = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("org_members").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Membro removido");
      refetch();
    }
    setDeleteTarget(null);
  };

  const toggleClonePermission = async (memberId: string, current: boolean) => {
    const { error } = await supabase.from("org_members").update({ can_clone_instance: !current }).eq("id", memberId);
    if (error) toast.error(error.message);
    else {
      toast.success(!current ? "Permissão concedida" : "Permissão removida");
      refetch();
    }
  };

  if (!org || !user) return null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground tracking-tight mb-6">Equipe</h1>

      <div className="space-y-4">
        {/* Invite section (admin only) */}
        {isAdmin && (
          <section className="rounded-lg border border-border p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-primary" /> Convidar Membro
              </h2>
              <p className="text-[10px] text-muted-foreground">
                Um link de convite será gerado e copiado automaticamente
              </p>
            </div>

            <div className="flex gap-2 mb-3">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                placeholder="email@exemplo.com"
                type="email"
                className="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button onClick={handleInvite} size="sm" disabled={inviting} className="gap-1 text-xs h-7">
                {inviting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Enviar
              </Button>
            </div>

            {pendingInvites.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Pendentes</p>
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{inv.email}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Expira {new Date(inv.expires_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 ml-2">
                      <button
                        onClick={() => copyInviteLink(inv.token, inv.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                        title="Copiar link"
                      >
                        {copiedId === inv.id ? (
                          <Check className="h-3 w-3 text-primary" />
                        ) : (
                          <Link2 className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={() => cancelInvite(inv.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                        title="Cancelar convite"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Members list */}
        <section className="rounded-lg border border-border p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-foreground">Membros</h2>
            <p className="text-[10px] text-muted-foreground">{members.length} na organização</p>
          </div>
          <div className="divide-y divide-border">
            {members.map((m) => {
              const isSelf = m.user_id === user.id;
              const isOnlyAdmin =
                m.role === "admin" && members.filter((x) => x.role === "admin").length === 1;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-semibold shrink-0">
                      {(m.profile?.full_name || m.profile?.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {m.profile?.full_name || "Sem nome"}
                        {isSelf && <span className="text-muted-foreground font-normal ml-1">(você)</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{m.profile?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                        <Crown className="h-2.5 w-2.5" /> Admin
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Membro</span>
                    )}
                    {isAdmin && !isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-50 bg-popover border border-border min-w-[160px]">
                          {m.role === "member" && (
                            <div
                              className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-accent rounded-sm"
                              onClick={() => toggleClonePermission(m.id, m.can_clone_instance)}
                            >
                              <span className="text-xs">Clonar instância</span>
                              <Switch
                                checked={m.can_clone_instance}
                                onCheckedChange={() => toggleClonePermission(m.id, m.can_clone_instance)}
                                className="scale-75"
                              />
                            </div>
                          )}
                          {m.role === "member" && <DropdownMenuSeparator />}
                          {m.role === "member" ? (
                            <DropdownMenuItem onClick={() => updateRole(m.id, "admin")} className="text-xs gap-2">
                              <Shield className="h-3 w-3" /> Promover a admin
                            </DropdownMenuItem>
                          ) : !isOnlyAdmin ? (
                            <DropdownMenuItem onClick={() => updateRole(m.id, "member")} className="text-xs gap-2">
                              <Shield className="h-3 w-3" /> Rebaixar a membro
                            </DropdownMenuItem>
                          ) : null}
                          {!isOnlyAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget({ id: m.id, name: m.profile?.full_name || "este membro" })}
                                className="text-xs gap-2 text-destructive focus:text-destructive"
                              >
                                <UserMinus className="h-3 w-3" /> Remover
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.name}</strong> da organização? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={removeMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
