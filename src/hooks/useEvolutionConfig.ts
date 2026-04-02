import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface EvolutionConfig {
  id: string;
  org_id: string;
  api_url: string;
  api_key: string;
  is_connected: boolean;
  tested_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useEvolutionConfig(orgId: string | undefined) {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['evolution-config', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('evolution_api_configs')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data as EvolutionConfig | null;
    },
    enabled: !!orgId,
  });

  const saveConfig = useMutation({
    mutationFn: async ({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) => {
      if (!orgId) throw new Error('Org não encontrada');
      
      // Test connection first
      const { data: testData, error: testError } = await supabase.functions.invoke('test-evolution-connection', {
        body: { api_url: apiUrl, api_key: apiKey },
      });
      if (testError) throw testError;
      if (!testData?.success) throw new Error(testData?.error || 'Falha na conexão');

      // Store API key in vault
      await supabase.functions.invoke('manage-vault-secrets', {
        body: { action: 'store', secret_name: `evo_api_key_${orgId}`, secret_value: apiKey, description: 'Evolution API Key', org_id: orgId },
      });

      // Upsert config (without storing actual key in table)
      const existing = configQuery.data;
      if (existing) {
        const { error } = await supabase
          .from('evolution_api_configs')
          .update({ api_url: apiUrl, api_key: '***vault***', is_connected: true, tested_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('evolution_api_configs')
          .insert({ org_id: orgId, api_url: apiUrl, api_key: '***vault***', is_connected: true, tested_at: new Date().toISOString() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evolution-config'] });
      toast.success('Evolution API conectada!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteConfig = useMutation({
    mutationFn: async () => {
      if (!configQuery.data) return;
      // Delete from vault
      await supabase.functions.invoke('manage-vault-secrets', {
        body: { action: 'delete', secret_name: `evo_api_key_${orgId}`, org_id: orgId },
      });
      // Delete from table
      const { error } = await supabase
        .from('evolution_api_configs')
        .delete()
        .eq('id', configQuery.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evolution-config'] });
      toast.success('Configuração removida');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    config: configQuery.data ?? null,
    isLoading: configQuery.isLoading,
    saveConfig,
    deleteConfig,
  };
}
