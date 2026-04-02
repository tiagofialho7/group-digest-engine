import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "./useOrganization";

export interface SetupStep {
  id: string;
  title: string;
  isComplete: boolean;
  isRequired: boolean;
}

export function useSetupStatus() {
  const { org } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const refetch = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!org?.id) { setLoading(false); return; }

    const check = async () => {
      setLoading(true);
      // Check Evolution API config
      const { data: evoConfig } = await supabase
        .from("evolution_api_configs")
        .select("id, is_connected")
        .eq("org_id", org.id)
        .maybeSingle();

      // Check Anthropic API key
      const { data: anthropicKey } = await supabase
        .from("org_api_keys")
        .select("id, is_valid")
        .eq("org_id", org.id)
        .eq("provider", "anthropic")
        .maybeSingle();

      // Check master instances
      const { data: masterInstances } = await supabase
        .from("whatsapp_instances")
        .select("id")
        .eq("org_id", org.id)
        .eq("instance_type", "master")
        .eq("status", "connected")
        .limit(1);

      // Check sending (user) instances
      const { data: sendingInstances } = await supabase
        .from("whatsapp_instances")
        .select("id")
        .eq("org_id", org.id)
        .eq("instance_type", "user")
        .eq("status", "connected")
        .limit(1);

      // Check if has any analysis rules configured
      const { data: analysisRules } = await supabase
        .from("analysis_rules")
        .select("id")
        .eq("org_id", org.id)
        .limit(1);

      setSteps([
        {
          id: "evolution",
          title: "Evolution API",
          isComplete: !!evoConfig?.is_connected,
          isRequired: true,
        },
        {
          id: "whatsapp_master",
          title: "Instância Mãe",
          isComplete: (masterInstances?.length || 0) > 0,
          isRequired: true,
        },
        {
          id: "whatsapp_sending",
          title: "Instância de Envio",
          isComplete: (sendingInstances?.length || 0) > 0,
          isRequired: false,
        },
        {
          id: "analysis_rules",
          title: "Regras de Análise",
          isComplete: (analysisRules?.length || 0) > 0,
          isRequired: false,
        },
        {
          id: "anthropic",
          title: "Anthropic",
          isComplete: !!anthropicKey?.is_valid,
          isRequired: false,
        },
      ]);
      setLoading(false);
    };

    check();
  }, [org?.id, refreshCounter]);

  const isComplete = steps.length > 0 && steps.every((s) => s.isComplete);
  const completedCount = steps.filter((s) => s.isComplete).length;
  const completionPercentage = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return { loading, steps, isComplete, completionPercentage, refetch };
}
