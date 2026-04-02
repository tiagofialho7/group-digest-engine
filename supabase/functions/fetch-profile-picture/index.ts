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
    const { org_id, phone_number, sender_name } = await req.json();

    if (!org_id || !phone_number) {
      return new Response(JSON.stringify({ error: 'org_id and phone_number required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if we already have a recent profile (less than 7 days old)
    const { data: existing } = await supabase
      .from('contact_profiles')
      .select('avatar_url, fetched_at')
      .eq('org_id', org_id)
      .eq('phone_number', phone_number)
      .maybeSingle();

    if (existing?.fetched_at) {
      const daysSinceFetch = (Date.now() - new Date(existing.fetched_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFetch < 7) {
        console.log(`[fetch-profile-picture] Cache hit for ${phone_number}`);
        return new Response(JSON.stringify({ avatar_url: existing.avatar_url, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
      console.warn('[fetch-profile-picture] No Evolution API config for org:', org_id);
      return new Response(JSON.stringify({ avatar_url: null, error: 'no_config' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get an active instance
    const { data: instances } = await supabase
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('org_id', org_id)
      .eq('is_active', true)
      .eq('status', 'connected')
      .limit(1);

    const instanceName = instances?.[0]?.instance_name;
    if (!instanceName) {
      console.warn('[fetch-profile-picture] No connected instance for org:', org_id);
      return new Response(JSON.stringify({ avatar_url: null, error: 'no_instance' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch profile picture from Evolution API
    const cleanUrl = config.api_url.replace(/\/+$/, '');
    const fetchUrl = `${cleanUrl}/chat/fetchProfilePictureUrl/${instanceName}`;
    
    console.log(`[fetch-profile-picture] Fetching for ${phone_number} via ${instanceName}`);

    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.api_key },
      body: JSON.stringify({ number: phone_number }),
    });

    let avatarUrl: string | null = null;

    if (response.ok) {
      const result = await response.json();
      const profilePicUrl = result.profilePictureUrl;

      if (profilePicUrl) {
        // Download the image and store in Supabase Storage (WhatsApp URLs expire)
        try {
          const imgResponse = await fetch(profilePicUrl);
          if (imgResponse.ok) {
            const imgBytes = new Uint8Array(await imgResponse.arrayBuffer());
            const filePath = `${org_id}/${phone_number}.jpg`;

            const { error: uploadError } = await supabase.storage
              .from('profile-pictures')
              .upload(filePath, imgBytes, {
                contentType: 'image/jpeg',
                upsert: true,
              });

            if (uploadError) {
              console.error('[fetch-profile-picture] Upload error:', uploadError.message);
            } else {
              const { data: publicUrlData } = supabase.storage
                .from('profile-pictures')
                .getPublicUrl(filePath);
              avatarUrl = publicUrlData.publicUrl;
              console.log(`[fetch-profile-picture] ✅ Stored avatar for ${phone_number}`);
            }
          }
        } catch (imgErr) {
          console.error('[fetch-profile-picture] Failed to download/store image:', imgErr);
        }
      } else {
        console.log(`[fetch-profile-picture] No profile picture for ${phone_number}`);
      }
    } else {
      console.warn(`[fetch-profile-picture] Evolution API error ${response.status}`);
    }

    // Upsert contact profile
    const { error: upsertError } = await supabase
      .from('contact_profiles')
      .upsert({
        org_id,
        phone_number,
        display_name: sender_name || null,
        avatar_url: avatarUrl,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'org_id,phone_number' });

    if (upsertError) {
      console.error('[fetch-profile-picture] Upsert error:', upsertError.message);
    }

    return new Response(JSON.stringify({ avatar_url: avatarUrl, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[fetch-profile-picture] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
