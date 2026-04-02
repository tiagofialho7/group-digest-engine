import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_name, org_id } = await req.json();

    if (!instance_name || !org_id) {
      return new Response(JSON.stringify({ error: 'instance_name e org_id são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Evolution API config
    const { data: configRow } = await supabase
      .from('evolution_api_configs')
      .select('api_url')
      .eq('org_id', org_id)
      .single();

    if (!configRow) {
      return new Response(JSON.stringify({ error: 'Evolution API não configurada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: vaultApiKey } = await supabase.rpc('get_vault_secret', { p_name: `evo_api_key_${org_id}` });
    if (!vaultApiKey) {
      return new Response(JSON.stringify({ error: 'API Key não encontrada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = configRow.api_url.replace(/\/$/, '');

    const res = await fetch(`${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance_name)}`, {
      headers: { 'apikey': vaultApiKey },
    });

    if (!res.ok && res.status !== 404) {
      return new Response(JSON.stringify({ available: false, error: `Evolution API error: ${res.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let taken = false;
    try {
      const data = await res.json();
      taken = Array.isArray(data) ? data.length > 0 : !!data?.instance;
    } catch {
      // 404 or empty = available
      taken = false;
    }

    return new Response(JSON.stringify({ available: !taken }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
