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
    const { org_id, group_ids } = await req.json();

    if (!org_id || !group_ids?.length) {
      return new Response(JSON.stringify({ error: 'org_id and group_ids required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Evolution API config (api_url from table, api_key from vault)
    const { data: configRow } = await supabase
      .from('evolution_api_configs')
      .select('api_url')
      .eq('org_id', org_id)
      .maybeSingle();

    const { data: vaultApiKey } = await supabase.rpc('get_vault_secret', { p_name: `evo_api_key_${org_id}` });
    const config = configRow && vaultApiKey ? { api_url: configRow.api_url, api_key: vaultApiKey } : null;

    if (!config) {
      return new Response(JSON.stringify({ pictures: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get a connected instance
    const { data: instances } = await supabase
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('org_id', org_id)
      .eq('is_active', true)
      .eq('status', 'connected')
      .limit(1);

    const instanceName = instances?.[0]?.instance_name;
    if (!instanceName) {
      return new Response(JSON.stringify({ pictures: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = config.api_url.replace(/\/+$/, '');
    const pictures: Record<string, string | null> = {};

    // Process in batches of 5
    for (let i = 0; i < group_ids.length; i += 5) {
      const batch = group_ids.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (groupId: string) => {
          try {
            const res = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': config.api_key },
              body: JSON.stringify({ number: groupId }),
            });
            if (!res.ok) return { groupId, url: null };
            const data = await res.json();
            const profilePicUrl = data?.profilePictureUrl || null;

            if (profilePicUrl) {
              // Download and store in Supabase Storage
              try {
                const imgRes = await fetch(profilePicUrl);
                if (imgRes.ok) {
                  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
                  const filePath = `groups/${org_id}/${groupId.replace('@', '_')}.jpg`;

                  await supabase.storage
                    .from('profile-pictures')
                    .upload(filePath, imgBytes, { contentType: 'image/jpeg', upsert: true });

                  const { data: publicUrlData } = supabase.storage
                    .from('profile-pictures')
                    .getPublicUrl(filePath);

                  const storedUrl = publicUrlData.publicUrl;

                  // Update monitored_groups
                  await supabase
                    .from('monitored_groups')
                    .update({ picture_url: storedUrl })
                    .eq('org_id', org_id)
                    .eq('whatsapp_group_id', groupId);

                  return { groupId, url: storedUrl };
                }
              } catch (e) {
                console.error(`[fetch-group-picture] Storage error for ${groupId}:`, e);
              }
            }
            return { groupId, url: null };
          } catch {
            return { groupId, url: null };
          }
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          pictures[r.value.groupId] = r.value.url;
        }
      }

      if (i + 5 < group_ids.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    return new Response(JSON.stringify({ pictures }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[fetch-group-picture] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
