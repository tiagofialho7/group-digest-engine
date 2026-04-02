import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?pin=v135";

/**
 * Convert Markdown formatting to WhatsApp-compatible formatting.
 * Key differences:
 * - Bold: **text** or __text__ → *text*
 * - Italic: *text* or _text_ → _text_ (but only single * for italic in MD)
 * - Strikethrough: ~~text~~ → ~text~
 * - Headers: # text → *text* (bold, since WA has no headers)
 * - Links: [text](url) → text (url)
 * - Images: ![alt](url) → removed
 */
function markdownToWhatsApp(md: string): string {
  let text = md;

  // Remove images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

  // Convert links [text](url) → text (url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  // Headers → bold (must be before bold conversion)
  // Handle ###, ##, # (all become *text*)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Bold: **text** or __text__ → *text*
  text = text.replace(/\*\*(.+?)\*\*/g, "*$1*");
  text = text.replace(/__(.+?)__/g, "*$1*");

  // Italic: single *text* in markdown context is tricky.
  // After bold conversion, remaining single markdown italic _text_ already works in WA.
  // But if the AI outputs *text* meaning italic (MD), it's now ambiguous with WA bold.
  // We leave _text_ as-is since it's valid WA italic.

  // Strikethrough: ~~text~~ → ~text~
  text = text.replace(/~~(.+?)~~/g, "~$1~");

  // Horizontal rules (---, ***, ___) → simple separator
  text = text.replace(/^[-*_]{3,}$/gm, "───────────");

  return text.trim();
}

/**
 * Strip ALL formatting markers from text, leaving only plain text.
 */
function stripAllFormatting(md: string): string {
  let text = md;
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "$1");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/__(.+?)__/g, "$1");
  text = text.replace(/\*(.+?)\*/g, "$1");
  text = text.replace(/_(.+?)_/g, "$1");
  text = text.replace(/~~(.+?)~~/g, "$1");
  text = text.replace(/~(.+?)~/g, "$1");
  text = text.replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/`{3}\w*\n?/g, "").trim());
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/^[-*_]{3,}$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { org_id, user_id, group_whatsapp_id, message, strip_formatting } = await req.json();

    if (!org_id || !user_id || !group_whatsapp_id || !message) {
      return new Response(JSON.stringify({ success: false, error: "Campos obrigatórios faltando" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Evolution API config (api_url from table, api_key from vault)
    const { data: configRow } = await supabase
      .from("evolution_api_configs")
      .select("api_url")
      .eq("org_id", org_id)
      .single();

    const { data: vaultApiKey } = await supabase.rpc('get_vault_secret', { p_name: `evo_api_key_${org_id}` });

    if (!configRow || !vaultApiKey) {
      return new Response(JSON.stringify({ success: false, error: "Evolution API não configurada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = { api_url: configRow.api_url, api_key: vaultApiKey };

    // Get user's personal instance (used for SENDING)
    const { data: userInstance } = await supabase
      .from("whatsapp_instances")
      .select("instance_name, status")
      .eq("org_id", org_id)
      .eq("user_id", user_id)
      .eq("instance_type", "user")
      .eq("is_active", true)
      .single();

    if (!userInstance) {
      return new Response(JSON.stringify({ success: false, error: "Você não tem uma instância de envio configurada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userInstance.status !== "connected") {
      return new Response(JSON.stringify({ success: false, error: "Sua instância não está conectada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = config.api_url.replace(/\/$/, "");

    // Send message via user's instance
    const sendRes = await fetch(`${baseUrl}/message/sendText/${userInstance.instance_name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.api_key,
      },
      body: JSON.stringify({
        number: group_whatsapp_id,
        text: strip_formatting ? stripAllFormatting(message) : markdownToWhatsApp(message),
      }),
    });

    if (!sendRes.ok) {
      const errorText = await sendRes.text();
      console.error(`[send-group-message] Error (${sendRes.status}): ${errorText.substring(0, 500)}`);
      return new Response(JSON.stringify({ success: false, error: `Erro ao enviar: ${sendRes.status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendData = await sendRes.json();
    console.log("[send-group-message] Message sent:", JSON.stringify(sendData).substring(0, 200));

    // Register the sent message directly in the database
    // so we don't depend on the webhook capturing it
    const sentMessageId = sendData?.key?.id || null;
    const sentText = strip_formatting ? stripAllFormatting(message) : markdownToWhatsApp(message);

    // Find the monitored group for this whatsapp_group_id within this org
    const { data: monitoredGroup } = await supabase
      .from("monitored_groups")
      .select("id")
      .eq("org_id", org_id)
      .eq("whatsapp_group_id", group_whatsapp_id)
      .maybeSingle();

    if (monitoredGroup) {
      // Use WhatsApp profile name + phone from instance
      let senderPhone: string | null = null;
      let whatsappName: string | null = null;

      // Get phone number and profile name from instance's ownerJid
      try {
        const instanceInfoRes = await fetch(
          `${baseUrl}/instance/fetchInstances?instanceName=${userInstance.instance_name}`,
          { headers: { apikey: config.api_key } }
        );
        if (instanceInfoRes.ok) {
          const raw = await instanceInfoRes.json();
          const info = Array.isArray(raw) ? raw[0] : raw;
          console.log("[send-group-message] Instance info keys:", JSON.stringify(Object.keys(info || {})));
          console.log("[send-group-message] Instance profileName:", info?.profileName, "name:", info?.name, "pushName:", info?.pushName, "profileStatus:", info?.profileStatus);
          const ownerJid = info?.ownerJid || info?.owner || null;
          senderPhone = ownerJid ? ownerJid.replace("@s.whatsapp.net", "") : null;
          whatsappName = info?.profileName || info?.pushName || info?.name || null;

          // If name not in instance info, try fetching via chat/fetchProfile
          if (!whatsappName && senderPhone) {
            try {
              const profileRes = await fetch(`${baseUrl}/chat/fetchProfile/${userInstance.instance_name}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: config.api_key },
                body: JSON.stringify({ number: senderPhone }),
              });
              if (profileRes.ok) {
                const profileData = await profileRes.json();
                console.log("[send-group-message] fetchProfile response:", JSON.stringify(profileData).substring(0, 300));
                whatsappName = profileData?.name || profileData?.pushName || profileData?.profileName || null;
              }
            } catch (profileErr) {
              console.warn("[send-group-message] Error fetching chat profile:", profileErr);
            }
          }
        }
      } catch (e) {
        console.warn("[send-group-message] Error fetching instance info:", e);
      }

      // Fallback to app profile name if WhatsApp name not available
      let displayName = whatsappName;
      if (!displayName) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user_id)
          .maybeSingle();
        displayName = profile?.full_name || "Usuário";
      }

      // Use display name + [GroupLens] tag marker
      const senderName = `${displayName} [GroupLens]`;

      // Fetch and store sender's profile picture (same logic as fetch-profile-picture)
      if (senderPhone) {
        try {
          const { data: existingContact } = await supabase
            .from("contact_profiles")
            .select("avatar_url, fetched_at")
            .eq("org_id", org_id)
            .eq("phone_number", senderPhone)
            .maybeSingle();

          const needsFetch = !existingContact?.fetched_at ||
            (Date.now() - new Date(existingContact.fetched_at).getTime()) / (1000 * 60 * 60 * 24) >= 7;

          if (needsFetch) {
            console.log(`[send-group-message] Fetching profile picture for sender ${senderPhone}`);
            const picRes = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${userInstance.instance_name}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: config.api_key },
              body: JSON.stringify({ number: senderPhone }),
            });

            let avatarUrl: string | null = null;

            if (picRes.ok) {
              const picData = await picRes.json();
              const profilePicUrl = picData?.profilePictureUrl;

              if (profilePicUrl) {
                try {
                  const imgResponse = await fetch(profilePicUrl);
                  if (imgResponse.ok) {
                    const imgBytes = new Uint8Array(await imgResponse.arrayBuffer());
                    const filePath = `${org_id}/${senderPhone}.jpg`;

                    const { error: uploadError } = await supabase.storage
                      .from("profile-pictures")
                      .upload(filePath, imgBytes, { contentType: "image/jpeg", upsert: true });

                    if (!uploadError) {
                      const { data: publicUrlData } = supabase.storage
                        .from("profile-pictures")
                        .getPublicUrl(filePath);
                      avatarUrl = publicUrlData.publicUrl;
                      console.log(`[send-group-message] ✅ Stored avatar for sender ${senderPhone}`);
                    }
                  }
                } catch (imgErr) {
                  console.warn("[send-group-message] Failed to download/store sender image:", imgErr);
                }
              }
            }

            await supabase
              .from("contact_profiles")
              .upsert({
                org_id,
                phone_number: senderPhone,
                display_name: displayName,
                avatar_url: avatarUrl,
                fetched_at: new Date().toISOString(),
              }, { onConflict: "org_id,phone_number" });
          }
        } catch (picErr) {
          console.warn("[send-group-message] Error fetching sender profile picture:", picErr);
        }
      }

      const { error: insertErr } = await supabase
        .from("messages")
        .insert({
          group_id: monitoredGroup.id,
          sender_name: senderName,
          sender_phone: senderPhone,
          content: sentText,
          whatsapp_message_id: sentMessageId,
          sent_at: new Date().toISOString(),
          message_type: "text",
        });

      if (insertErr) {
        // Don't fail the response — message was sent successfully
        console.warn("[send-group-message] Failed to register sent message:", insertErr.message);
      } else {
        console.log("[send-group-message] Sent message registered in DB");
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[send-group-message] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
