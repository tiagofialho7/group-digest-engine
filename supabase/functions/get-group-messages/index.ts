import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AttemptResult {
  method: string;
  url: string;
  status: number | null;
  error: string | null;
  success: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    let apiKey = evoConfig.api_key;
    if (apiKey === "***vault***") {
      const { data: vaultKey } = await supabaseAdmin.rpc("get_vault_secret", {
        p_name: `evo_api_key_${orgId}`,
      });
      if (vaultKey) apiKey = vaultKey;
    }

    const { data: instanceData } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("phone_number")
      .eq("instance_name", instanceName)
      .eq("org_id", orgId)
      .single();

    const agentPhone = instanceData?.phone_number || null;
    const attempts: AttemptResult[] = [];
    let messages: any[] = [];
    let successMethod: string | null = null;

    // Attempt 1: POST /chat/findMessages/{instanceName}
    const url1 = `${evoConfig.api_url}/chat/findMessages/${instanceName}`;
    try {
      console.log(`Attempt 1: POST ${url1}`);
      const res1 = await fetch(url1, {
        method: "POST",
        headers: { apikey: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ where: { key: { remoteJid: groupId } }, limit: 50 }),
      });
      const body1 = await res1.text();
      if (res1.ok) {
        const parsed = JSON.parse(body1);
        const arr = Array.isArray(parsed) ? parsed : (parsed?.messages || []);
        if (arr.length > 0) {
          messages = arr;
          successMethod = "POST /chat/findMessages";
          attempts.push({ method: "POST /chat/findMessages", url: url1, status: res1.status, error: null, success: true });
        } else {
          attempts.push({ method: "POST /chat/findMessages", url: url1, status: res1.status, error: `OK but empty (${body1.substring(0, 200)})`, success: false });
        }
      } else {
        attempts.push({ method: "POST /chat/findMessages", url: url1, status: res1.status, error: body1.substring(0, 300), success: false });
      }
    } catch (e) {
      attempts.push({ method: "POST /chat/findMessages", url: url1, status: null, error: String(e), success: false });
    }

    // Attempt 2: GET /chat/fetchMessages/{instanceName}/{groupId}
    if (!successMethod) {
      const url2 = `${evoConfig.api_url}/chat/fetchMessages/${instanceName}/${groupId}?limit=50`;
      try {
        console.log(`Attempt 2: GET ${url2}`);
        const res2 = await fetch(url2, {
          method: "GET",
          headers: { apikey: apiKey, "Content-Type": "application/json" },
        });
        const body2 = await res2.text();
        if (res2.ok) {
          const parsed = JSON.parse(body2);
          const arr = Array.isArray(parsed) ? parsed : (parsed?.messages || []);
          if (arr.length > 0) {
            messages = arr;
            successMethod = "GET /chat/fetchMessages";
            attempts.push({ method: "GET /chat/fetchMessages", url: url2, status: res2.status, error: null, success: true });
          } else {
            attempts.push({ method: "GET /chat/fetchMessages", url: url2, status: res2.status, error: `OK but empty (${body2.substring(0, 200)})`, success: false });
          }
        } else {
          attempts.push({ method: "GET /chat/fetchMessages", url: url2, status: res2.status, error: body2.substring(0, 300), success: false });
        }
      } catch (e) {
        attempts.push({ method: "GET /chat/fetchMessages", url: url2, status: null, error: String(e), success: false });
      }
    }

    // Attempt 3: GET /message/findMessages/{instanceName}
    if (!successMethod) {
      const url3 = `${evoConfig.api_url}/message/findMessages/${instanceName}?remoteJid=${encodeURIComponent(groupId)}&limit=50`;
      try {
        console.log(`Attempt 3: GET ${url3}`);
        const res3 = await fetch(url3, {
          method: "GET",
          headers: { apikey: apiKey, "Content-Type": "application/json" },
        });
        const body3 = await res3.text();
        if (res3.ok) {
          const parsed = JSON.parse(body3);
          const arr = Array.isArray(parsed) ? parsed : (parsed?.messages || []);
          messages = arr;
          successMethod = "GET /message/findMessages";
          attempts.push({ method: "GET /message/findMessages", url: url3, status: res3.status, error: null, success: true });
        } else {
          attempts.push({ method: "GET /message/findMessages", url: url3, status: res3.status, error: body3.substring(0, 300), success: false });
        }
      } catch (e) {
        attempts.push({ method: "GET /message/findMessages", url: url3, status: null, error: String(e), success: false });
      }
    }

    return new Response(JSON.stringify({
      messages,
      agentPhone,
      debug: {
        groupId,
        instanceName,
        apiUrl: evoConfig.api_url,
        successMethod,
        attempts,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-group-messages error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
