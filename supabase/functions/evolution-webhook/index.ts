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
    const body = await req.json();

    console.log('[evolution-webhook] FULL BODY:', JSON.stringify(body, null, 2));

    const event = body.event || body.action || 'unknown';
    console.log(`[evolution-webhook] Event: ${event}`);

    // Store raw webhook payload for debugging (scrub sensitive fields)
    const sanitizedBody = JSON.parse(JSON.stringify(body));
    if (sanitizedBody.apikey) sanitizedBody.apikey = '***REDACTED***';
    if (sanitizedBody.data?.apikey) sanitizedBody.data.apikey = '***REDACTED***';
    if (sanitizedBody.server_url) sanitizedBody.server_url = '***REDACTED***';
    
    const { error: logError } = await supabase
      .from('webhook_logs')
      .insert({
        event_type: event,
        payload: sanitizedBody,
        instance_name: body.instance || body.instanceName || null,
      });

    if (logError) {
      console.warn('[evolution-webhook] Failed to store log:', logError.message);
    }

    // Handle message events
    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      const messageData = body.data || {};
      const key = messageData.key || {};
      const isGroup = key.remoteJid?.endsWith('@g.us');

      if (isGroup) {
        const groupJid = key.remoteJid;
        const senderName = messageData.pushName || key.participant || 'Desconhecido';
        const senderPhone = key.participant?.replace('@s.whatsapp.net', '') || null;
        const messageId = key.id || null;
        const sentAt = messageData.messageTimestamp 
          ? new Date(Number(messageData.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        // Detect message type
        const messageType = messageData.messageType || 'conversation';
        const isImage = messageType === 'imageMessage' || !!messageData.message?.imageMessage;

        // Extract text content
        const content = messageData.message?.conversation 
          || messageData.message?.extendedTextMessage?.text 
          || messageData.message?.imageMessage?.caption
          || '';

        // Extract reply context
        const ctxInfo = messageData.contextInfo;
        const replyToWhatsappId = ctxInfo?.stanzaId || null;
        const quotedContent = ctxInfo?.quotedMessage?.conversation || null;
        const quotedSender = ctxInfo?.participant || null;

        if (replyToWhatsappId) {
          console.log(`[evolution-webhook] Reply detected: ${messageId} -> ${replyToWhatsappId}`);
        }

        // Process if there's content OR if it's an image
        if (content || isImage) {
          // Find ALL monitored groups across all orgs
          const { data: groups } = await supabase
            .from('monitored_groups')
            .select('id, org_id')
            .eq('whatsapp_group_id', groupJid);

          if (groups && groups.length > 0) {
            console.log(`[evolution-webhook] Group ${groupJid} monitored by ${groups.length} org(s)`);

            for (const group of groups) {
              let imageUrl: string | null = null;

              // If it's an image, fetch the base64 and upload to storage (per org)
              if (isImage && messageId) {
                console.log(`[evolution-webhook] Image message detected, fetching media for ${messageId} (org: ${group.org_id})`);
                try {
                  imageUrl = await fetchAndStoreImage(supabase, group.org_id, messageId, supabaseUrl);
                } catch (imgErr) {
                  console.error(`[evolution-webhook] Failed to fetch/store image for org ${group.org_id}:`, imgErr);
                }
              }

              // Check for duplicate message (might already be registered by send-group-message)
              if (messageId) {
                const { data: existing } = await supabase
                  .from('messages')
                  .select('id')
                  .eq('group_id', group.id)
                  .eq('whatsapp_message_id', messageId)
                  .maybeSingle();

                if (existing) {
                  console.log(`[evolution-webhook] Message ${messageId} already exists for group ${group.id}, skipping`);
                  continue;
                }
              }

              const { error: msgError } = await supabase
                .from('messages')
                .insert({
                  group_id: group.id,
                  sender_name: senderName,
                  sender_phone: senderPhone,
                  content: content || (isImage ? '[Imagem]' : ''),
                  whatsapp_message_id: messageId,
                  sent_at: sentAt,
                  message_type: isImage ? 'image' : 'text',
                  reply_to_whatsapp_id: replyToWhatsappId,
                  quoted_content: quotedContent,
                  quoted_sender: quotedSender,
                  image_url: imageUrl,
                });

              if (msgError) {
                console.error(`[evolution-webhook] Failed to store message for org ${group.org_id}:`, msgError.message);
              } else {
                console.log(`[evolution-webhook] Message stored for group ${groupJid} org ${group.org_id}${imageUrl ? ' (with image)' : ''}`);

                // Trigger profile picture fetch in background (fire-and-forget, per org)
                if (senderPhone) {
                  fetch(`${supabaseUrl}/functions/v1/fetch-profile-picture`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseServiceKey}`,
                    },
                    body: JSON.stringify({
                      org_id: group.org_id,
                      phone_number: senderPhone,
                      sender_name: senderName,
                    }),
                  }).catch(err => console.warn('[evolution-webhook] Profile pic fetch failed:', err));
                }
              }
            }
          } else {
            console.log(`[evolution-webhook] Group ${groupJid} not monitored, skipping`);
          }
        }
      }
    }

    // Handle connection updates
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = body.data?.state || body.data?.status;
      const instanceName = body.instance || body.instanceName;

      if (instanceName && state) {
        let status = 'disconnected';
        if (state === 'open' || state === 'connected') status = 'connected';
        else if (state === 'close' || state === 'disconnected') status = 'disconnected';

        const { error: updateErr } = await supabase
          .from('whatsapp_instances')
          .update({ status })
          .eq('instance_name', instanceName);

        if (updateErr) {
          console.warn('[evolution-webhook] Failed to update instance status:', updateErr.message);
        } else {
          console.log(`[evolution-webhook] Instance ${instanceName} status -> ${status}`);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[evolution-webhook] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchAndStoreImage(
  supabase: any,
  orgId: string,
  whatsappMessageId: string,
  supabaseUrl: string
): Promise<string | null> {
  // Get Evolution API config (api_url from table, api_key from vault)
  const { data: configRow } = await supabase
    .from('evolution_api_configs')
    .select('api_url')
    .eq('org_id', orgId)
    .maybeSingle();

  const { data: vaultApiKey } = await supabase.rpc('get_vault_secret', { p_name: `evo_api_key_${orgId}` });
  const config = configRow && vaultApiKey ? { api_url: configRow.api_url, api_key: vaultApiKey } : null;

  if (!config) {
    console.warn('[evolution-webhook] No Evolution API config found for org:', orgId);
    
    // Try instance secrets as fallback (also from vault)
    const { data: instances } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_name')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .limit(1);

    if (!instances?.length) {
      console.warn('[evolution-webhook] No active instances found for org');
      return null;
    }

    // Try vault for instance-level secrets
    const { data: instanceApiUrl } = await supabase.rpc('get_vault_secret', { p_name: `whatsapp_api_url_${instances[0].id}` });
    const { data: instanceApiKey } = await supabase.rpc('get_vault_secret', { p_name: `whatsapp_api_key_${instances[0].id}` });

    if (!instanceApiUrl || !instanceApiKey) {
      // Fallback to old table
      const { data: secret } = await supabase
        .from('whatsapp_instance_secrets')
        .select('api_url, api_key')
        .eq('instance_id', instances[0].id)
        .maybeSingle();

      if (!secret) {
        console.warn('[evolution-webhook] No instance secrets found');
        return null;
      }

      return await downloadAndUpload(supabase, secret.api_url, secret.api_key, instances[0].instance_name, whatsappMessageId, supabaseUrl);
    }

    return await downloadAndUpload(supabase, instanceApiUrl, instanceApiKey, instances[0].instance_name, whatsappMessageId, supabaseUrl);
  }

  // Get an instance name to use in the endpoint
  const { data: instances } = await supabase
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .limit(1);

  const instanceName = instances?.[0]?.instance_name;
  if (!instanceName) {
    console.warn('[evolution-webhook] No instance name found');
    return null;
  }

  return await downloadAndUpload(supabase, config.api_url, config.api_key, instanceName, whatsappMessageId, supabaseUrl);
}

async function downloadAndUpload(
  supabase: any,
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  whatsappMessageId: string,
  supabaseUrl: string
): Promise<string | null> {
  // Fetch base64 from Evolution API
  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const fetchUrl = `${cleanUrl}/chat/getBase64FromMediaMessage/${instanceName}`;
  
  console.log(`[evolution-webhook] Fetching media from: ${fetchUrl}`);

  const response = await fetch(fetchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    },
    body: JSON.stringify({
      message: {
        key: { id: whatsappMessageId }
      }
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[evolution-webhook] Evolution API error ${response.status}:`, errText);
    return null;
  }

  const media = await response.json();
  
  if (!media.base64) {
    console.warn('[evolution-webhook] No base64 in media response');
    return null;
  }

  // Extract the actual base64 data (remove data:image/...;base64, prefix if present)
  let base64Data = media.base64;
  let mimeType = media.mimetype || 'image/jpeg';
  
  if (base64Data.startsWith('data:')) {
    const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
  }

  // Convert base64 to Uint8Array
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Determine file extension
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const filePath = `${instanceName}/${whatsappMessageId}.${ext}`;

  console.log(`[evolution-webhook] Uploading image to storage: ${filePath} (${bytes.length} bytes)`);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(filePath, bytes, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error('[evolution-webhook] Storage upload error:', uploadError.message);
    return null;
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(filePath);

  console.log(`[evolution-webhook] ✅ Image stored: ${publicUrlData.publicUrl}`);
  return publicUrlData.publicUrl;
}
