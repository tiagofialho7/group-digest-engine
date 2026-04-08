import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { orgId } = await req.json();
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Missing orgId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch Evolution API config
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

    // 2. Get master instance
    const { data: instance } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("instance_name, phone_number")
      .eq("org_id", orgId)
      .eq("instance_type", "master")
      .eq("status", "connected")
      .limit(1)
      .single();

    if (!instance) {
      return new Response(JSON.stringify({ error: "No connected WhatsApp instance" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch agent instructions
    const { data: schedConfig } = await supabaseAdmin
      .from("agent_schedule_config")
      .select("agent_instructions")
      .eq("org_id", orgId)
      .single();

    const agentInstructions = (schedConfig as any)?.agent_instructions || "Você é um analista comercial.";

    // 4. Fetch all active prospection groups
    const { data: groups } = await supabaseAdmin
      .from("prospection_groups")
      .select("id, group_name, current_stage, prospect_name, prospect_company, whatsapp_group_id, priority")
      .eq("org_id", orgId)
      .eq("is_active", true);

    if (!groups || groups.length === 0) {
      // Log execution
      await supabaseAdmin.from("agent_execution_logs").insert({
        org_id: orgId, groups_checked: 0, messages_sent: 0, status: "success",
      });
      return new Response(JSON.stringify({ groups_checked: 0, messages_sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalMessagesSent = 0;
    const errors: string[] = [];

    for (const group of groups) {
      try {
        // Skip closed deals
        if (group.current_stage === "deal_won" || group.current_stage === "deal_lost") {
          console.log(`Group ${group.group_name}: skipped — deal finalized (${group.current_stage})`);
          continue;
        }

        // 5. Fetch last 50 WhatsApp messages for this group
        let whatsappMessages: any[] = [];
        try {
          const msgRes = await fetch(
            `${evoConfig.api_url}/chat/findMessages/${instance.instance_name}`,
            {
              method: "POST",
              headers: { apikey: apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({
                where: { key: { remoteJid: group.whatsapp_group_id } },
                limit: 50,
              }),
            }
          );
          if (msgRes.ok) {
            const data = await msgRes.json();
            whatsappMessages = Array.isArray(data) ? data : [];
          }
        } catch (e) {
          console.error(`Failed to fetch messages for group ${group.id}:`, e);
        }

        // 6. Fetch agent's previous messages for this group
        const { data: prevAgentMsgs } = await supabaseAdmin
          .from("agent_messages")
          .select("message_text, sent_at, message_type")
          .eq("prospection_group_id", group.id)
          .order("sent_at", { ascending: false })
          .limit(5);

        // 7. Build context for AI
        const messagesContext = whatsappMessages.map((m: any) => {
          const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
          const sender = m.pushName || (m.key?.fromMe ? "Agente" : "Participante");
          const time = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleString("pt-BR") : "";
          return `[${time}] ${sender}: ${text}`;
        }).filter((t: string) => t.includes(": ") && t.split(": ")[1].trim()).join("\n");

        const agentHistory = (prevAgentMsgs || []).map((m: any) =>
          `[${new Date(m.sent_at).toLocaleString("pt-BR")}] Agente (${m.message_type}): ${m.message_text}`
        ).join("\n");

        const stageMap: Record<string, string> = {
          pre_qualification: "Pré-Qualificação",
          contact_made: "Contato Realizado",
          visit_done: "Visita Realizada",
          project_elaborated: "Projeto Elaborado",
          project_presented: "Projeto Apresentado",
          deal_won: "Negócio Fechado",
          deal_lost: "Negócio Perdido",
        };

        const userPrompt = `GRUPO: ${group.group_name}
EMPRESA: ${group.prospect_company || "N/A"}
PROSPECTO: ${group.prospect_name || "N/A"}
FASE ATUAL: ${stageMap[group.current_stage] || group.current_stage}
PRIORIDADE: ${group.priority === "high" ? "URGENTE" : "Normal"}

ÚLTIMAS MENSAGENS DO GRUPO:
${messagesContext || "(sem mensagens recentes)"}

HISTÓRICO DE COBRANÇAS DO AGENTE:
${agentHistory || "(nenhuma cobrança anterior)"}

DATA/HORA ATUAL: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}

Baseado no contexto acima, você deve enviar alguma mensagem agora? Se sim, qual?
Responda APENAS em JSON válido: { "should_send": boolean, "message": string | null, "reasoning": string }`;

        // 8. Call AI
        const aiRes = await fetch(AI_GATEWAY, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: agentInstructions },
              { role: "user", content: userPrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "agent_decision",
                description: "Decide whether to send a message to the prospection group",
                parameters: {
                  type: "object",
                  properties: {
                    should_send: { type: "boolean", description: "Whether to send a message" },
                    message: { type: "string", description: "The message to send, or null if should_send is false" },
                    reasoning: { type: "string", description: "Brief reasoning for the decision" },
                  },
                  required: ["should_send", "reasoning"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "agent_decision" } },
          }),
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          console.error(`AI error for group ${group.id}: ${aiRes.status} ${errText}`);
          errors.push(`AI error for ${group.group_name}: ${aiRes.status}`);
          continue;
        }

        const aiData = await aiRes.json();
        let decision: { should_send: boolean; message?: string | null; reasoning: string };

        // Parse tool call response
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          decision = JSON.parse(toolCall.function.arguments);
        } else {
          // Fallback: try parsing content
          const content = aiData.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            decision = JSON.parse(jsonMatch[0]);
          } else {
            console.log(`No decision for ${group.group_name}: ${content}`);
            continue;
          }
        }

        console.log(`Group ${group.group_name}: should_send=${decision.should_send}, reasoning=${decision.reasoning}`);

        if (decision.should_send && decision.message) {
          // 9. Send message via Evolution API
          const sendRes = await fetch(
            `${evoConfig.api_url}/message/sendText/${instance.instance_name}`,
            {
              method: "POST",
              headers: { apikey: evoConfig.api_key, "Content-Type": "application/json" },
              body: JSON.stringify({
                number: group.whatsapp_group_id,
                text: decision.message,
              }),
            }
          );

          let whatsappMsgId: string | null = null;
          if (sendRes.ok) {
            const sendData = await sendRes.json();
            whatsappMsgId = sendData?.key?.id || null;
          } else {
            const errText = await sendRes.text();
            console.error(`Send error for ${group.group_name}: ${sendRes.status} ${errText}`);
            errors.push(`Send failed for ${group.group_name}`);
            continue;
          }

          // 10. Record in agent_messages
          await supabaseAdmin.from("agent_messages").insert({
            org_id: orgId,
            prospection_group_id: group.id,
            message_text: decision.message,
            message_type: "followup",
            delivered: true,
            whatsapp_message_id: whatsappMsgId,
          });

          // 11. Resolve pending followups
          await supabaseAdmin
            .from("agent_pending_followups")
            .update({ status: "resolved", resolved_at: new Date().toISOString() })
            .eq("prospection_group_id", group.id)
            .eq("status", "pending");

          // Update last_activity_at
          await supabaseAdmin
            .from("prospection_groups")
            .update({ last_agent_check_at: new Date().toISOString() })
            .eq("id", group.id);

          totalMessagesSent++;
        } else {
          // Check if we need a pending followup (last agent msg > 24h without response)
          const lastAgentMsg = prevAgentMsgs?.[0];
          if (lastAgentMsg) {
            const hoursSinceAgent = (Date.now() - new Date(lastAgentMsg.sent_at).getTime()) / (1000 * 60 * 60);
            if (hoursSinceAgent > 24) {
              // Check if there's already a pending followup
              const { data: existing } = await supabaseAdmin
                .from("agent_pending_followups")
                .select("id")
                .eq("prospection_group_id", group.id)
                .eq("status", "pending")
                .limit(1);

              if (!existing || existing.length === 0) {
                await supabaseAdmin.from("agent_pending_followups").insert({
                  org_id: orgId,
                  prospection_group_id: group.id,
                  followup_type: "reinforcement",
                  scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                  message_template: "Reforço automático — sem resposta há +24h",
                });
              }
            }
          }

          // Update last check
          await supabaseAdmin
            .from("prospection_groups")
            .update({ last_agent_check_at: new Date().toISOString() })
            .eq("id", group.id);
        }
      } catch (groupErr) {
        console.error(`Error processing group ${group.id}:`, groupErr);
        errors.push(`Error for ${group.group_name}: ${groupErr instanceof Error ? groupErr.message : "unknown"}`);
      }
    }

    // 12. Log execution
    await supabaseAdmin.from("agent_execution_logs").insert({
      org_id: orgId,
      groups_checked: groups.length,
      messages_sent: totalMessagesSent,
      status: errors.length > 0 ? "partial_error" : "success",
      error_log: errors.length > 0 ? errors.join("; ") : null,
    });

    return new Response(JSON.stringify({
      groups_checked: groups.length,
      messages_sent: totalMessagesSent,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("prospection-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
