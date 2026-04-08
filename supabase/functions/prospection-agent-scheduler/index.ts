import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get current time in Brazil (UTC-3)
    const now = new Date();
    const brazilOffset = -3 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const brazilMinutes = utcMinutes + brazilOffset + (24 * 60);
    const brazilHour = Math.floor((brazilMinutes % (24 * 60)) / 60);
    const brazilMinute = brazilMinutes % 60;
    const brazilDay = now.getUTCDay(); // 0=Sun, 6=Sat

    // Check if manual trigger
    let body: any = {};
    try { body = await req.json(); } catch {}
    const isManual = body?.manual === true;
    const targetOrgId = body?.orgId;

    if (!isManual) {
      // Check if it's a weekday (1-5)
      if (brazilDay === 0 || brazilDay === 6) {
        return new Response(JSON.stringify({ skipped: true, reason: "Weekend" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if current time is within ±5 min of scheduled times
      const checkTimes = [
        { h: 8, m: 0 },
        { h: 12, m: 0 },
        { h: 15, m: 0 },
      ];

      const isScheduledTime = checkTimes.some(t => {
        const diff = Math.abs((brazilHour * 60 + brazilMinute) - (t.h * 60 + t.m));
        return diff <= 5;
      });

      if (!isScheduledTime) {
        return new Response(JSON.stringify({ skipped: true, reason: "Not scheduled time" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch all active schedule configs (or specific org if manual)
    let query = supabaseAdmin
      .from("agent_schedule_config")
      .select("org_id, is_active, monday, tuesday, wednesday, thursday, friday, saturday, sunday, check_time_1, check_time_2, check_time_3")
      .eq("is_active", true);

    if (targetOrgId) {
      query = query.eq("org_id", targetOrgId);
    }

    const { data: configs } = await query;

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "No active configs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const results: any[] = [];

    for (const config of configs) {
      const dayKey = dayKeys[brazilDay];
      if (!isManual && !(config as any)[dayKey]) continue;

      if (!isManual) {
        // Check specific scheduled times from config
        const times = [config.check_time_1, config.check_time_2, config.check_time_3]
          .filter(Boolean)
          .map((t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
          });

        const currentMinutes = brazilHour * 60 + brazilMinute;
        const isNearScheduled = times.some(t => Math.abs(currentMinutes - t) <= 5);
        if (!isNearScheduled) continue;
      }

      // Invoke the prospection-agent function
      try {
        const agentRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/prospection-agent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ orgId: config.org_id }),
          }
        );

        const agentData = await agentRes.json();
        results.push({ org_id: config.org_id, ...agentData });
      } catch (e) {
        console.error(`Error invoking agent for org ${config.org_id}:`, e);
        results.push({ org_id: config.org_id, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    return new Response(JSON.stringify({ executed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scheduler error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
