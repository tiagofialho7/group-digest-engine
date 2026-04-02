import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import GroupCard from "@/components/GroupCard";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { useGroupPictures } from "@/hooks/useGroupPictures";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { SetupBanner } from "@/components/setup/SetupBanner";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { MemberSetupBanner } from "@/components/setup/MemberSetupBanner";
import { MemberSetupWizard } from "@/components/setup/MemberSetupWizard";

interface GroupData {
  id: string;
  name: string;
  participant_count: number;
  whatsapp_group_id: string;
  is_active: boolean;
  created_at: string;
  newMessages: number;
  pendingQuestions: number;
  lastAnalysisDate: string | null;
  isUserMember: boolean;
  picture_url?: string | null;
}

export default function Dashboard() {
  const { org, loading: orgLoading, isAdmin } = useOrganization();
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const { steps, refetch: refetchSetup } = useSetupStatus();
  const pictures = useGroupPictures(org?.id, groups);

  // Step 1: Load groups immediately (fast query)
  useEffect(() => {
    if (!org) { setLoading(false); return; }

    const fetchGroups = async () => {
      const { data: monitoredGroups } = await supabase
        .from("monitored_groups")
        .select("id, name, participant_count, whatsapp_group_id, is_active, created_at, picture_url")
        .eq("org_id", org.id)
        .eq("is_active", true);

      if (!monitoredGroups?.length) { setGroups([]); setLoading(false); return; }

      setGroups(monitoredGroups.map(g => ({
        id: g.id,
        name: g.name,
        participant_count: g.participant_count,
        whatsapp_group_id: g.whatsapp_group_id,
        is_active: g.is_active,
        created_at: g.created_at,
        picture_url: g.picture_url,
        newMessages: 0,
        pendingQuestions: 0,
        lastAnalysisDate: null,
        isUserMember: true,
      })));
      setLoading(false);
    };

    fetchGroups();
  }, [org]);

  // Step 2: Load stats in background
  useEffect(() => {
    if (!org || !user || groups.length === 0 || loading || statsLoaded) return;

    const fetchStats = async () => {
      const groupIds = groups.map(g => g.id);

      const { data: analyses } = await supabase
        .from("analyses")
        .select("id, group_id, created_at")
        .in("group_id", groupIds)
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      const latestByGroup = new Map<string, { id: string; created_at: string }>();
      for (const a of analyses || []) {
        if (!latestByGroup.has(a.group_id)) {
          latestByGroup.set(a.group_id, { id: a.id, created_at: a.created_at });
        }
      }

      const analysisIds = Array.from(latestByGroup.values()).map(a => a.id);
      let pendingByAnalysis = new Map<string, number>();
      if (analysisIds.length > 0) {
        const { data: blocks } = await supabase
          .from("context_blocks")
          .select("analysis_id")
          .in("analysis_id", analysisIds)
          .eq("is_answered", false);

        for (const b of blocks || []) {
          pendingByAnalysis.set(b.analysis_id, (pendingByAnalysis.get(b.analysis_id) || 0) + 1);
        }
      }

      const msgCounts = await Promise.all(
        groups.map(async (g) => {
          const latest = latestByGroup.get(g.id);
          let q = supabase.from("messages").select("id", { count: "exact", head: true }).eq("group_id", g.id);
          if (latest) q = q.gt("sent_at", latest.created_at);
          const { count } = await q;
          return { id: g.id, count: count || 0 };
        })
      );
      const msgCountMap = new Map(msgCounts.map(m => [m.id, m.count]));

      let membershipMap: Record<string, boolean> = {};
      try {
        const { data } = await supabase.functions.invoke("check-group-membership", {
          body: {
            org_id: org.id,
            user_id: user.id,
            group_whatsapp_ids: groups.map(g => g.whatsapp_group_id),
          },
        });
        if (data?.success) membershipMap = data.membership || {};
      } catch {}

      setGroups(prev => prev.map(g => {
        const latest = latestByGroup.get(g.id);
        const analysisId = latest?.id;
        return {
          ...g,
          newMessages: msgCountMap.get(g.id) || 0,
          pendingQuestions: analysisId ? (pendingByAnalysis.get(analysisId) || 0) : 0,
          lastAnalysisDate: latest?.created_at || null,
          isUserMember: membershipMap[g.whatsapp_group_id] !== false,
        };
      }));
      setStatsLoaded(true);
    };

    fetchStats();
  }, [org, user, groups.length, loading, statsLoaded]);

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {isAdmin ? (
        <>
          <SetupBanner onOpenWizard={() => setWizardOpen(true)} />
          <SetupWizard isOpen={wizardOpen} onClose={() => { setWizardOpen(false); refetchSetup(); }} />
        </>
      ) : (
        <>
          <MemberSetupBanner onOpenWizard={() => setWizardOpen(true)} />
          <MemberSetupWizard isOpen={wizardOpen} onClose={() => { setWizardOpen(false); }} />
        </>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Meus Grupos</h1>
        <Link to="/select-groups">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-medium text-foreground mb-1">Nenhum grupo monitorado</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Adicione grupos do WhatsApp para começar.
          </p>
          <Link to="/select-groups">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Adicionar Grupo
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {groups.map((group, i) => (
            <GroupCard
              key={group.id}
              style={{ animationDelay: `${i * 50}ms` }}
              pictureUrl={pictures[group.id]}
              group={{
                id: group.id,
                name: group.name,
                participantCount: group.participant_count,
                newMessages: group.newMessages,
                lastAnalysisDate: group.lastAnalysisDate,
                pendingQuestions: group.pendingQuestions,
                isUserMember: group.isUserMember,
                status: "active",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
