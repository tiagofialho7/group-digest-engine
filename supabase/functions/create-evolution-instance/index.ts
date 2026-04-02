// Edge function: create-evolution-instance
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { instance_name, name, org_id, instance_type, user_id, use_existing } = await req.json();

    if (!instance_name || !name || !org_id) {
      return new Response(JSON.stringify({ success: false, error: 'Campos obrigatórios: instance_name, name, org_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Evolution API config from org (api_url from table, api_key from vault)
    const { data: configRow, error: configErr } = await supabase
      .from('evolution_api_configs')
      .select('api_url')
      .eq('org_id', org_id)
      .single();

    if (configErr || !configRow) {
      return new Response(JSON.stringify({ success: false, error: 'Evolution API não configurada para esta organização' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: vaultApiKey } = await supabase.rpc('get_vault_secret', { p_name: `evo_api_key_${org_id}` });
    if (!vaultApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'API Key da Evolution não encontrada no vault' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const config = { api_url: configRow.api_url, api_key: vaultApiKey };

    const baseUrl = config.api_url.replace(/\/$/, '');

    let qrCode: string | null = null;

    if (use_existing) {
      // Skip creating in Evolution API — just link the existing instance
      // Try to get connection status
      try {
        const statusRes = await fetch(`${baseUrl}/instance/connectionState/${instance_name}`, {
          headers: { 'apikey': config.api_key },
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const state = statusData?.state || statusData?.instance?.state || 'unknown';
          if (state === 'open' || state === 'connected') {
            // Already connected, good
          }
        }
      } catch (e) {
        console.warn('[create-evolution-instance] Status check failed:', e);
      }
    } else {
      // 1. Create instance in Evolution API
      console.log(`[create-evolution-instance] Creating: ${instance_name} at ${baseUrl}`);
      const createRes = await fetch(`${baseUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': config.api_key },
        body: JSON.stringify({
          instanceName: instance_name,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          groupsIgnore: false,
        }),
      });

      const createText = await createRes.text();
      console.log(`[create-evolution-instance] Response (${createRes.status}): ${createText.substring(0, 500)}`);

      let createData: any = {};
      try { createData = JSON.parse(createText); } catch {}

      if (!createRes.ok && createRes.status !== 200 && createRes.status !== 201) {
        return new Response(JSON.stringify({
          success: false,
          error: `Erro ao criar instância: ${createRes.status}`,
          details: createText,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 2. Get QR Code
      qrCode = createData?.qrcode?.base64 || createData?.hash?.qrcode || null;

      if (!qrCode) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const qrRes = await fetch(`${baseUrl}/instance/connect/${instance_name}`, {
          headers: { 'apikey': config.api_key },
        });
        if (qrRes.ok) {
          const qrText = await qrRes.text();
          try {
            const qrData = JSON.parse(qrText);
            qrCode = qrData?.base64 || qrData?.qrcode?.base64 || null;
          } catch {}
        }
      }
    }

    // 3. Save to database
    const { data: instance, error: insertError } = await supabase
      .from('whatsapp_instances')
      .insert({
        org_id,
        user_id: user_id || null,
        name,
        instance_name,
        instance_type: instance_type || 'master',
        provider_type: 'evolution_self_hosted',
        status: use_existing ? 'connected' : (qrCode ? 'qr_required' : 'disconnected'),
        qr_code: qrCode,
        is_default: true,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ success: false, error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Configure webhook (only for master instances, NOT user/sending instances)
    const effectiveType = instance_type || 'master';
    if (!use_existing && effectiveType === 'master') {
    const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
    try {
      await fetch(`${baseUrl}/webhook/set/${instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': config.api_key },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhook_by_events: false,
            webhook_base64: false,
            events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
          },
        }),
      });
    } catch (e) {
      console.warn('[create-evolution-instance] Webhook setup failed (non-fatal):', e);
    }
    }

    return new Response(JSON.stringify({
      success: true,
      instance_id: instance.id,
      qr_code: qrCode,
      status: instance.status,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[create-evolution-instance] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
