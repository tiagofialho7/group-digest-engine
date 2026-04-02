import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "./useOrganization";
import { useAuth } from "./useAuth";

export interface MemberSetupStep {
  id: string;
  title: string;
  isComplete: boolean;
}

export function useMemberSetupStatus() {
  const { org } = useOrganization();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<MemberSetupStep[]>([]);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const refetch = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!org?.id || !user?.id) { setLoading(false); return; }

    const check = async () => {
      setLoading(true);

      // Check profile name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      const hasName = !!profile?.full_name?.trim();
      const hasAvatar = !!profile?.avatar_url?.trim();

      // Check sending instance
      const { data: sendingInstances } = await supabase
        .from("whatsapp_instances")
        .select("id")
        .eq("org_id", org.id)
        .eq("instance_type", "user")
        .eq("user_id", user.id)
        .eq("status", "connected")
        .limit(1);

      const hasSending = (sendingInstances?.length || 0) > 0;

      setSteps([
        { id: "name", title: "Nome", isComplete: hasName },
        { id: "avatar", title: "Foto de Perfil", isComplete: hasAvatar },
        { id: "sending", title: "Instância de Envio", isComplete: hasSending },
      ]);
      setLoading(false);
    };

    check();
  }, [org?.id, user?.id, refreshCounter]);

  const isComplete = steps.length > 0 && steps.every((s) => s.isComplete);
  const completedCount = steps.filter((s) => s.isComplete).length;
  const completionPercentage = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return { loading, steps, isComplete, completionPercentage, refetch };
}
