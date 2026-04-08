import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Use service role for DB access (vault secrets, etc.)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user token
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { groupId, instanceName, orgId } = await req.json();
    if (!groupId || !instanceName || !orgId) {
      return new Response(JSON.stringify({ error: "Missing groupId, instanceName, or orgId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is org member
    const { data: membership } = await supabaseAdmin
      .from("org_members")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a member of this organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch Evolution API credentials
    const { data: evoConfig } = await supabaseAdmin
      .from("evolution_api_configs")
      .select("api_url, api_key")
      .eq("org_id", orgId)
      .single();

    if (!evoConfig) {
      return new Response(JSON.stringify({ error: "Evolution API not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get real API key from vault if stored there
    let apiKey = evoConfig.api_key;
    if (apiKey === "***vault***") {
      const { data: vaultKey } = await supabaseAdmin.rpc("get_vault_secret", {
        p_name: `evo_api_key_${orgId}`,
      });
      if (vaultKey) apiKey = vaultKey;
    }

    // Fetch instance phone number to identify agent messages
    const { data: instanceData } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("phone_number")
      .eq("instance_name", instanceName)
      .eq("org_id", orgId)
      .single();

    const agentPhone = instanceData?.phone_number || null;

    // Fetch messages from Evolution API
    console.log(`Fetching messages for group ${groupId} via instance ${instanceName}`);
    const response = await fetch(
      `${evoConfig.api_url}/chat/findMessages/${instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          where: { key: { remoteJid: groupId } },
          limit: 50,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Evolution API error:", response.status, errText);
      return new Response(JSON.stringify({ error: `Evolution API error (${response.status}): ${errText}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = await response.json();

    return new Response(JSON.stringify({ messages: Array.isArray(messages) ? messages : [], agentPhone }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-group-messages error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
