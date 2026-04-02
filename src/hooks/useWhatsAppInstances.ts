import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type InstanceStatus = 'connected' | 'connecting' | 'disconnected' | 'qr_required';

export interface WhatsAppInstance {
  id: string;
  org_id: string;
  user_id: string | null;
  name: string;
  instance_name: string;
  instance_type: string;
  provider_type: string;
  phone_number: string | null;
  status: InstanceStatus;
  qr_code: string | null;
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export function useWhatsAppInstances(orgId: string | undefined) {
  const queryClient = useQueryClient();

  const instancesQuery = useQuery({
    queryKey: ['whatsapp-instances', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WhatsAppInstance[];
    },
    enabled: !!orgId,
  });

  const deleteInstance = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('delete-evolution-instance', {
        body: { instance_id: id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao remover');
      if (data.evolution_error) {
        toast.warning(`Removida localmente, mas falhou na Evolution: ${data.evolution_error}`);
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      toast.success('Instância removida');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const setDefaultInstance = useMutation({
    mutationFn: async (id: string) => {
      // Remove default from all, then set
      if (orgId) {
        await supabase.from('whatsapp_instances').update({ is_default: false }).eq('org_id', orgId);
      }
      const { error } = await supabase.from('whatsapp_instances').update({ is_default: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      toast.success('Instância padrão definida');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  return {
    instances: instancesQuery.data ?? [],
    isLoading: instancesQuery.isLoading,
    refetch: instancesQuery.refetch,
    deleteInstance,
    setDefaultInstance,
  };
}
