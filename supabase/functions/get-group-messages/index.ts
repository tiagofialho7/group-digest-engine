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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { groupId, instanceName, orgId } = await req.json();
    if (!groupId || !instanceName || !orgId) {
      return new Response(JSON.stringify({ error: "Missing groupId, instanceName, or orgId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch Evolution API credentials
    const { data: evoConfig } = await supabase
      .from("evolution_api_configs")
      .select("api_url, api_key")
      .eq("org_id", orgId)
      .single();

    if (!evoConfig) {
      return new Response(JSON.stringify({ error: "Evolution API not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch instance phone number to identify agent messages
    const { data: instanceData } = await supabase
      .from("whatsapp_instances")
      .select("phone_number")
      .eq("instance_name", instanceName)
      .eq("org_id", orgId)
      .single();

    const agentPhone = instanceData?.phone_number || null;

    // Fetch messages from Evolution API
    const response = await fetch(
      `${evoConfig.api_url}/chat/findMessages/${instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: evoConfig.api_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          where: { key: { remoteJid: groupId } },
          limit: 30,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Evolution API error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Failed to fetch messages from WhatsApp" }), {
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
