import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { orgId } = await req.json();
    if (!orgId) {
      return new Response(JSON.stringify({ error: "orgId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get Evolution API config
    const { data: evoConfig, error: evoErr } = await supabase
      .from("evolution_api_configs")
      .select("api_url, api_key")
      .eq("org_id", orgId)
      .maybeSingle();

    if (evoErr || !evoConfig) {
      return new Response(
        JSON.stringify({ error: "Evolution API não configurada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get real API key from vault if stored there
    let apiKey = evoConfig.api_key;
    if (apiKey === "***vault***") {
      const { data: vaultKey } = await supabase.rpc("get_vault_secret", {
        p_name: `evo_api_key_${orgId}`,
      });
      if (vaultKey) apiKey = vaultKey;
    }

    // Get master instance
    const { data: instance, error: instErr } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("org_id", orgId)
      .eq("instance_type", "master")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (instErr || !instance) {
      return new Response(
        JSON.stringify({ error: "Nenhuma instância WhatsApp conectada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceName = instance.instance_name;
    const url = `${evoConfig.api_url}/group/fetchAllGroups/${instanceName}?getParticipants=false`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Evolution API error:", errText);
      return new Response(
        JSON.stringify({ error: `Evolution API error: ${response.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const groups = (Array.isArray(data) ? data : []).map((g: any) => ({
      id: g.id,
      subject: g.subject || g.name || "Sem nome",
      size: g.size || 0,
      pictureUrl: g.pictureUrl || null,
    }));

    return new Response(JSON.stringify({ groups }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-whatsapp-groups error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
