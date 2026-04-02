import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchPhoneFromEvolution(baseUrl: string, apiKey: string, instanceName: string): Promise<string | null> {
  // Strategy 1: fetchInstances with instanceName query param — returns owner JID
  try {
    const res = await fetch(`${baseUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
      headers: { apikey: apiKey },
    });
    if (res.ok) {
      const data = await res.json();
      // Response can be array or single object
      const instances = Array.isArray(data) ? data : [data];
      for (const inst of instances) {
        const owner = inst?.instance?.owner || inst?.owner || "";
        if (owner) {
          const phone = owner.split("@")?.[0]?.split(":")?.[0];
          if (phone && phone.length >= 8) {
            console.log(`[check-membership] Resolved phone via fetchInstances: ${phone}`);
            return phone;
          }
        }
      }
    }
  } catch (e) {
    console.warn(`[check-membership] fetchInstances failed for ${instanceName}:`, e);
  }

  // Strategy 2: connectionState — some versions return wuid
  try {
    const res = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
      headers: { apikey: apiKey },
    });
    if (res.ok) {
      const data = await res.json();
      const wuid = data?.instance?.wuid || data?.wuid || "";
      if (wuid) {
        const phone = wuid.split("@")?.[0]?.split(":")?.[0];
        if (phone && phone.length >= 8) {
          console.log(`[check-membership] Resolved phone via connectionState: ${phone}`);
          return phone;
        }
      }
    }
  } catch (e) {
    console.warn(`[check-membership] connectionState failed for ${instanceName}:`, e);
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { org_id, user_id, group_whatsapp_ids } = await req.json();

    if (!org_id || !user_id) {
      return new Response(JSON.stringify({ success: false, error: "org_id e user_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const baseUrl = config.api_url.replace(/\/$/, "");

    const { data: userInstance } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, phone_number, status")
      .eq("org_id", org_id)
      .eq("user_id", user_id)
      .eq("instance_type", "user")
      .eq("is_active", true)
      .maybeSingle();

    const { data: masterInstance } = await supabase
      .from("whatsapp_instances")
      .select("instance_name, status")
      .eq("org_id", org_id)
      .eq("instance_type", "master")
      .eq("is_active", true)
      .maybeSingle();

    // Bypass: user instance is a clone of master
    if (userInstance && masterInstance &&
        userInstance.instance_name === masterInstance.instance_name &&
        masterInstance.status === "connected") {
      const result: Record<string, boolean> = {};
      for (const gid of (group_whatsapp_ids || [])) result[gid] = true;
      return new Response(JSON.stringify({ success: true, membership: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userInstance || userInstance.status !== "connected") {
      const result: Record<string, boolean> = {};
      for (const gid of (group_whatsapp_ids || [])) result[gid] = false;
      return new Response(JSON.stringify({ success: true, membership: result, reason: "no_user_instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!masterInstance || masterInstance.status !== "connected") {
      return new Response(JSON.stringify({ success: false, error: "Instância mãe não está conectada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve phone_number
    let userPhone = userInstance.phone_number;

    if (!userPhone) {
      console.log(`[check-membership] phone_number is null for ${userInstance.instance_name}, fetching from Evolution API...`);
      userPhone = await fetchPhoneFromEvolution(baseUrl, config.api_key, userInstance.instance_name);

      if (userPhone) {
        console.log(`[check-membership] Saving phone ${userPhone} to DB for instance ${userInstance.id}`);
        await supabase
          .from("whatsapp_instances")
          .update({ phone_number: userPhone })
          .eq("id", userInstance.id);
      } else {
        console.warn(`[check-membership] Could not resolve phone for ${userInstance.instance_name}`);
      }
    }

    const membership: Record<string, boolean> = {};

    if (userPhone) {
      const cleanPhone = userPhone.replace(/\D/g, "");
      for (const groupId of (group_whatsapp_ids || [])) {
        try {
          const res = await fetch(
            `${baseUrl}/group/participants/${masterInstance.instance_name}?groupJid=${groupId}`,
            { headers: { apikey: config.api_key } }
          );
          if (!res.ok) { membership[groupId] = false; continue; }
          const participants = await res.json();
          const participantList = Array.isArray(participants) ? participants : participants?.participants || [];
          const userJid = `${cleanPhone}@s.whatsapp.net`;
          membership[groupId] = participantList.some((p: any) => {
            const pId = p.id || p.jid || p.participant || "";
            return pId === userJid || pId.startsWith(cleanPhone);
          });
        } catch (err) {
          console.error(`[check-membership] Error checking group ${groupId}:`, err);
          membership[groupId] = false;
        }
      }
    } else {
      // Ultimate fallback: list groups from user's own instance
      console.log(`[check-membership] No phone, trying to list groups from user instance...`);
      try {
        const res = await fetch(
          `${baseUrl}/group/fetchAllGroups/${userInstance.instance_name}?getParticipants=false`,
          { headers: { apikey: config.api_key } }
        );
        if (res.ok) {
          const allGroups = await res.json();
          const groupList = Array.isArray(allGroups) ? allGroups : [];
          const userGroupIds = new Set(groupList.map((g: any) => g.id || g.jid || g.groupJid || ""));
          for (const groupId of (group_whatsapp_ids || [])) {
            membership[groupId] = userGroupIds.has(groupId);
          }
        } else {
          console.warn(`[check-membership] fetchAllGroups failed: ${res.status}`);
          for (const gid of (group_whatsapp_ids || [])) membership[gid] = false;
        }
      } catch (err) {
        console.error(`[check-membership] fetchAllGroups error:`, err);
        for (const gid of (group_whatsapp_ids || [])) membership[gid] = false;
      }
    }

    return new Response(JSON.stringify({ success: true, membership }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[check-group-membership] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
