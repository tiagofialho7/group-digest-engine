import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchPicturesInBatches(
  baseUrl: string,
  instanceName: string,
  apiKey: string,
  groupIds: string[],
  batchSize = 10,
  delayMs = 300
): Promise<Map<string, string | null>> {
  const pictureMap = new Map<string, string | null>();

  for (let i = 0; i < groupIds.length; i += batchSize) {
    const batch = groupIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (groupId) => {
        try {
          const res = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ number: groupId }),
          });
          if (!res.ok) return { groupId, url: null };
          const data = await res.json();
          return { groupId, url: data?.profilePictureUrl || null };
        } catch {
          return { groupId, url: null };
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        pictureMap.set(r.value.groupId, r.value.url);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < groupIds.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return pictureMap;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { org_id, include_pictures = false } = await req.json();

    if (!org_id) {
      return new Response(JSON.stringify({ success: false, error: 'org_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Evolution API config (api_url from table, api_key from vault)
    const { data: configRow, error: configErr } = await supabase
      .from('evolution_api_configs')
      .select('api_url')
      .eq('org_id', org_id)
      .single();

    const { data: vaultApiKey } = await supabase.rpc('get_vault_secret', { p_name: `evo_api_key_${org_id}` });

    if (configErr || !configRow || !vaultApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'Evolution API não configurada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const config = { api_url: configRow.api_url, api_key: vaultApiKey };

    // Get the master instance
    const { data: masterInstance, error: instanceErr } = await supabase
      .from('whatsapp_instances')
      .select('instance_name, status')
      .eq('org_id', org_id)
      .eq('instance_type', 'master')
      .eq('is_active', true)
      .single();

    if (instanceErr || !masterInstance) {
      return new Response(JSON.stringify({ success: false, error: 'Nenhuma instância mãe configurada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (masterInstance.status !== 'connected') {
      return new Response(JSON.stringify({ success: false, error: 'Instância mãe não está conectada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = config.api_url.replace(/\/$/, '');
    const instanceName = masterInstance.instance_name;

    // Fetch groups from Evolution API
    console.log(`[list-evolution-groups] Fetching groups for instance: ${instanceName}`);
    const groupsRes = await fetch(`${baseUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
      headers: { 'apikey': config.api_key },
    });

    if (!groupsRes.ok) {
      const errorText = await groupsRes.text();
      console.error(`[list-evolution-groups] Error (${groupsRes.status}): ${errorText.substring(0, 500)}`);
      return new Response(JSON.stringify({ success: false, error: `Erro ao buscar grupos: ${groupsRes.status}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const groupsData = await groupsRes.json();
    console.log(`[list-evolution-groups] Found ${Array.isArray(groupsData) ? groupsData.length : 0} groups`);

    // Normalize the response
    const groups = (Array.isArray(groupsData) ? groupsData : []).map((g: any) => ({
      id: g.id || g.jid || g.groupId,
      subject: g.subject || g.name || g.groupName || 'Sem nome',
      size: g.size || g.participants?.length || 0,
      pictureUrl: null as string | null,
    }));

    // Fetch pictures if requested
    if (include_pictures && groups.length > 0) {
      console.log(`[list-evolution-groups] Fetching pictures for ${groups.length} groups`);
      const pictureMap = await fetchPicturesInBatches(
        baseUrl, instanceName, config.api_key,
        groups.map((g: any) => g.id)
      );
      for (const group of groups) {
        group.pictureUrl = pictureMap.get(group.id) || null;
      }
      console.log(`[list-evolution-groups] Pictures fetched`);
    }

    return new Response(JSON.stringify({ success: true, groups }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[list-evolution-groups] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
