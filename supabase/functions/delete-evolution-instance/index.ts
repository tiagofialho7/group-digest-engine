import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { instance_id } = await req.json();

    if (!instance_id) {
      return new Response(JSON.stringify({ success: false, error: 'instance_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instance_id)
      .single();

    if (!instance) {
      return new Response(JSON.stringify({ success: false, error: 'Instância não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Evolution API config (api_url from table, api_key from vault)
    const { data: configRow } = await supabase
      .from('evolution_api_configs')
      .select('api_url')
      .eq('org_id', instance.org_id)
      .maybeSingle();

    const { data: vaultApiKey } = await supabase.rpc('get_vault_secret', { p_name: `evo_api_key_${instance.org_id}` });
    const config = configRow && vaultApiKey ? { api_url: configRow.api_url, api_key: vaultApiKey } : null;

    let evolutionError: string | null = null;

    // Delete from Evolution API
    if (config?.api_url && config?.api_key) {
      try {
        const baseUrl = config.api_url.replace(/\/$/, '');
        const deleteRes = await fetch(`${baseUrl}/instance/delete/${instance.instance_name}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'apikey': config.api_key },
        });
        if (!deleteRes.ok) {
          evolutionError = `Evolution API retornou ${deleteRes.status}`;
        }
      } catch (err) {
        evolutionError = err instanceof Error ? err.message : 'Erro desconhecido';
      }
    }

    // Soft delete
    const { error: dbError } = await supabase
      .from('whatsapp_instances')
      .update({ is_active: false })
      .eq('id', instance_id);

    if (dbError) {
      return new Response(JSON.stringify({ success: false, error: dbError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, evolution_error: evolutionError }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[delete-evolution-instance] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
