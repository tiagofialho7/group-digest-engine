import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_BATCH_SIZE = 10;
const DELAY_BETWEEN_GROUPS_MS = 2000;
const RETRY_DELAY_MS = 10000;
const TIAGO_PHONE_NUMBERS = ["5585815536698", "558581553698", "+5585815536698", "+558581553698"];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const stageMap: Record<string, string> = {
  pre_qualification: "Pré-Qualificação",
  contact_made: "Contato Realizado",
  visit_done: "Visita Realizada",
  project_elaborated: "Projeto Elaborado",
  project_presented: "Projeto Apresentado",
  deal_won: "Negócio Fechado",
  deal_lost: "Negócio Perdido",
};

const validStages = Object.keys(stageMap);

interface GroupResult {
  messagesSent: number;
  stageUpdated: boolean;
  error?: string;
  decision?: any;
}

function checkTiagoIntervention(
  whatsappMessages: any[],
): { tiagoSent: boolean; tiagoTime: string | null } {
  let tiagoSent = false;
  let tiagoTime: string | null = null;

  for (const m of whatsappMessages) {
    const senderPhone = m.key?.participant || m.participant || "";
    const cleanPhone = senderPhone.replace(/[@\+\s\-]/g, "").replace(/@.*/, "");
    const msgTimestamp = m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : 0;
    const is24hAgo = msgTimestamp > Date.now() - 24 * 60 * 60 * 1000;

    if (is24hAgo && TIAGO_PHONE_NUMBERS.some(t => cleanPhone.includes(t.replace(/[\+\-\s]/g, "")))) {
      tiagoSent = true;
      tiagoTime = new Date(msgTimestamp).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
    }
  }

  return { tiagoSent, tiagoTime };
}

async function processGroup(
  group: any,
  supabaseAdmin: any,
  evoConfig: any,
  apiKey: string,
  anthropicKey: string,
  instance: any,
  agentInstructions: string,
  orgId: string,
): Promise<GroupResult> {
  const result: GroupResult = { messagesSent: 0, stageUpdated: false };

  try {
    console.log(`[${group.group_name}] MODELO EM USO: ${AI_MODEL} (Anthropic Claude)`);

    if (group.current_stage === "deal_won" || group.current_stage === "deal_lost") {
      console.log(`Group ${group.group_name}: skipped — deal finalized (${group.current_stage})`);
      return result;
    }

    // Fetch saved context
    const { data: savedContext } = await supabaseAdmin
      .from("prospection_context")
      .select("*")
      .eq("prospection_group_id", group.id)
      .single();

    const hasContext = savedContext && savedContext.context_summary;
    const messageLimit = hasContext ? 30 : 30;

    // Fetch WhatsApp messages
    let whatsappMessages: any[] = [];
    try {
      const msgRes = await fetch(
        `${evoConfig.api_url}/chat/findMessages/${instance.instance_name}`,
        {
          method: "POST",
          headers: { apikey: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            where: { key: { remoteJid: group.whatsapp_group_id } },
            limit: messageLimit,
          }),
        }
      );
      if (msgRes.ok) {
        const data = await msgRes.json();
        const arr = Array.isArray(data) ? data
          : (data?.messages?.records || data?.records || data?.messages || []);
        whatsappMessages = Array.isArray(arr) ? arr : [];
      }
    } catch (e) {
      console.error(`Failed to fetch messages for group ${group.id}:`, e);
    }

    // Fetch agent's previous messages
    const { data: prevAgentMsgs } = await supabaseAdmin
      .from("agent_messages")
      .select("message_text, sent_at, message_type")
      .eq("prospection_group_id", group.id)
      .order("sent_at", { ascending: false })
      .limit(5);

    // Build context — detect message types explicitly
    const messageTypes: string[] = [];
    const messagesContext = whatsappMessages.map((m: any) => {
      const msgType = m.messageType || Object.keys(m.message || {}).find(k => k !== "messageContextInfo") || "unknown";
      const isAudio = msgType === "audioMessage" || msgType === "pttMessage" || 
        (m.message?.audioMessage != null) || (m.message?.pttMessage != null) ||
        (m.message?.audioMessage?.mimetype || m.message?.pttMessage?.mimetype || "").includes("audio/");
      const isImage = msgType === "imageMessage" || m.message?.imageMessage != null;
      const isVideo = msgType === "videoMessage" || m.message?.videoMessage != null;
      const isDocument = msgType === "documentMessage" || m.message?.documentMessage != null;
      const isSticker = msgType === "stickerMessage" || m.message?.stickerMessage != null;

      let typeLabel = "texto";
      if (isAudio) typeLabel = "áudio";
      else if (isImage) typeLabel = "imagem";
      else if (isVideo) typeLabel = "vídeo";
      else if (isDocument) typeLabel = "documento";
      else if (isSticker) typeLabel = "figurinha";
      messageTypes.push(typeLabel);

      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
      const sender = m.pushName || (m.key?.fromMe ? "Agente" : "Participante");
      const time = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleString("pt-BR") : "";
      
      if (isAudio) return `[${time}] ${sender}: [ÁUDIO - não transcrito]`;
      if (isImage) return `[${time}] ${sender}: [IMAGEM]${text ? " " + text : ""}`;
      if (isVideo) return `[${time}] ${sender}: [VÍDEO]${text ? " " + text : ""}`;
      if (isDocument) return `[${time}] ${sender}: [DOCUMENTO]`;
      if (isSticker) return `[${time}] ${sender}: [FIGURINHA]`;
      return `[${time}] ${sender}: ${text}`;
    }).filter((t: string) => t.includes(": ") && t.split(": ")[1].trim()).join("\n");

    const typeSummary = `TIPOS DE MENSAGEM PRESENTES: [${messageTypes.join(", ")}]`;

    // Check Tiago humano intervention
    const tiagoCheck = checkTiagoIntervention(whatsappMessages);
    let tiagoSection = "";
    if (tiagoCheck.tiagoSent) {
      tiagoSection = `\nREGRA ABSOLUTA — TIAGO HUMANO: Tiago humano enviou mensagem às ${tiagoCheck.tiagoTime} (últimas 24h). O agente NÃO PODE enviar mensagem neste grupo. should_send DEVE ser false. Período de 24h é inegociável.`;
      console.log(`[TIAGO CHECK] ${group.group_name}: tiagoSent=true às ${tiagoCheck.tiagoTime} — bloqueando envio`);
    }

    const agentHistory = (prevAgentMsgs || []).map((m: any) =>
      `[${new Date(m.sent_at).toLocaleString("pt-BR")}] Agente (${m.message_type}): ${m.message_text}`
    ).join("\n");

    let memorySection = "";
    if (hasContext) {
      memorySection = `CONTEXTO SALVO DA ÚLTIMA ANÁLISE:
Resumo: ${savedContext.context_summary || "(vazio)"}
Pendências: ${savedContext.pending_actions || "(nenhuma)"}
Datas importantes: ${savedContext.key_dates || "(nenhuma)"}

MENSAGENS NOVAS DESDE A ÚLTIMA ANÁLISE:`;
    } else {
      memorySection = "ÚLTIMAS MENSAGENS DO GRUPO:";
    }

    const notesSection = group.notes
      ? `\nNOTAS DA PROSPECÇÃO (contexto importante — PRIORIDADE MÁXIMA na análise):\n${group.notes}\n`
      : "";

    const userPrompt = `GRUPO: ${group.group_name}
EMPRESA: ${group.prospect_company || "N/A"}
PROSPECTO: ${group.prospect_name || "N/A"}
FASE ATUAL: ${stageMap[group.current_stage] || group.current_stage}
PRIORIDADE: ${group.priority === "high" ? "URGENTE" : "Normal"}
${notesSection}${tiagoSection}
${typeSummary}
IMPORTANTE: Se não há "áudio" na lista de tipos acima, NÃO mencione áudios na sua resposta. Só referencie áudios se o tipo "áudio" aparecer explicitamente na lista.

${memorySection}
${messagesContext || "(sem mensagens recentes)"}

HISTÓRICO DE COBRANÇAS DO AGENTE:
${agentHistory || "(nenhuma cobrança anterior)"}

DATA/HORA ATUAL: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}

Baseado no contexto acima, você deve enviar alguma mensagem agora? Se sim, qual?
Responda APENAS em JSON válido: { "should_send": boolean, "message": string | null, "reasoning": string, "context_summary": string, "pending_actions": string, "key_dates": string }`;

    // Call Anthropic Claude with retry on 429
    const makeAiCall = () => fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1000,
        system: agentInstructions,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{
          name: "agent_decision",
          description: "Decide whether to send a message to the prospection group and save context",
          input_schema: {
            type: "object",
            properties: {
              should_send: { type: "boolean", description: "Whether to send a message" },
              message: { type: "string", description: "The message to send, or null if should_send is false" },
              reasoning: { type: "string", description: "Brief reasoning for the decision" },
              suggested_stage: { type: "string", description: "If the conversation indicates the prospection moved to a new stage, provide the stage key (pre_qualification, contact_made, visit_done, project_elaborated, project_presented, deal_won, deal_lost). Otherwise omit or set to null." },
              context_summary: { type: "string", description: "Resumo conciso do estado atual desta prospecção (2-3 frases)" },
              pending_actions: { type: "string", description: "Ações pendentes identificadas, separadas por ponto-e-vírgula" },
              key_dates: { type: "string", description: "Datas/horários importantes mencionados, separados por ponto-e-vírgula" },
            },
            required: ["should_send", "reasoning", "context_summary", "pending_actions", "key_dates"],
          },
        }],
        tool_choice: { type: "tool", name: "agent_decision" },
      }),
    });

    let aiRes = await makeAiCall();
    if (aiRes.status === 429) {
      console.warn(`[${group.group_name}] Rate limited (429), retrying in ${RETRY_DELAY_MS}ms...`);
      await delay(RETRY_DELAY_MS);
      aiRes = await makeAiCall();
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error(`AI error for group ${group.id}: ${aiRes.status} ${errText}`);
      result.error = `AI error for ${group.group_name}: ${aiRes.status}`;
      return result;
    }

    const aiData = await aiRes.json();
    console.log(`[${group.group_name}] RAW AI RESPONSE:`, JSON.stringify(aiData).substring(0, 500));

    let decision: any;
    try {
      const toolUseBlock = aiData.content?.find((b: any) => b.type === "tool_use");
      if (toolUseBlock?.input) {
        decision = toolUseBlock.input;
      } else {
        const textBlock = aiData.content?.find((b: any) => b.type === "text");
        const content = textBlock?.text || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          decision = JSON.parse(jsonMatch[0]);
        } else {
          result.error = `No parsable decision for ${group.group_name}`;
          return result;
        }
      }
    } catch (parseError) {
      result.error = `Decision parse failed for ${group.group_name}: ${parseError instanceof Error ? parseError.message : "unknown"}`;
      return result;
    }

    // Normalize suggested_stage
    const rawStage = decision.suggested_stage;
    const suggestedStage = (rawStage && rawStage !== "none" && rawStage !== "null" && String(rawStage).trim() !== "") ? String(rawStage).trim() : null;

    // REGRA ABSOLUTA: Se Tiago humano enviou mensagem nas últimas 24h → should_send = false, sem exceção
    if (tiagoCheck.tiagoSent && decision.should_send) {
      console.log(`[TIAGO OVERRIDE] ${group.group_name}: Tiago humano enviou às ${tiagoCheck.tiagoTime} (últimas 24h) — forçando should_send=false`);
      decision.should_send = false;
      decision.reasoning = (decision.reasoning || "") + " [OVERRIDE: Tiago humano já cobrou e houve resposta]";
    }

    console.log(`[${group.group_name}] DECISION PARSED:`, JSON.stringify(decision));
    console.log("[STAGE]", group.group_name, "current:", group.current_stage, "suggested:", suggestedStage);
    console.log(`[${group.group_name}] should_send=${decision.should_send}, reasoning=${decision.reasoning?.substring(0, 100)}`);

    // Save/update context memory
    if (decision.context_summary || decision.pending_actions || decision.key_dates) {
      const contextData = {
        org_id: orgId,
        prospection_group_id: group.id,
        context_summary: decision.context_summary || "",
        pending_actions: decision.pending_actions || "",
        key_dates: decision.key_dates || "",
        last_stage_detected: group.current_stage,
        last_analyzed_at: new Date().toISOString(),
      };

      if (savedContext) {
        await supabaseAdmin.from("prospection_context").update(contextData).eq("id", savedContext.id);
      } else {
        await supabaseAdmin.from("prospection_context").insert(contextData);
      }
    }

    // Stage update
    if (suggestedStage && validStages.includes(suggestedStage) && suggestedStage !== group.current_stage) {
      console.log(`[STAGE] Advancing ${group.group_name}: ${group.current_stage} → ${suggestedStage}`);

      const { error: stageError } = await supabaseAdmin
        .from("prospection_groups")
        .update({ current_stage: suggestedStage, updated_at: new Date().toISOString() })
        .eq("id", group.id);

      if (stageError) {
        console.error(`[STAGE ERROR] ${group.group_name}:`, stageError);
        result.error = `Stage update failed for ${group.group_name}: ${stageError.message}`;
      } else {
        console.log(`[STAGE OK] ${group.group_name} → ${suggestedStage}`);
        const { error: historyError } = await supabaseAdmin
          .from("prospection_stage_history")
          .insert({
            prospection_group_id: group.id,
            from_stage: group.current_stage,
            to_stage: suggestedStage,
            changed_by: "agent",
            reason: decision.reasoning,
          });

        if (historyError) {
          result.error = `Stage history insert failed for ${group.group_name}: ${historyError.message}`;
        } else {
          result.stageUpdated = true;
        }
      }
    }

    result.decision = {
      group_id: group.id,
      group_name: group.group_name,
      modelo_usado: AI_MODEL,
      reasoning: decision.reasoning,
      suggested_stage: suggestedStage,
      current_stage: group.current_stage,
      stage_updated: result.stageUpdated,
      should_send: decision.should_send,
    };

    // Send message if needed
    if (decision.should_send && decision.message) {
      const sendRes = await fetch(
        `${evoConfig.api_url}/message/sendText/${instance.instance_name}`,
        {
          method: "POST",
          headers: { apikey: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: group.whatsapp_group_id, text: decision.message }),
        }
      );

      let whatsappMsgId: string | null = null;
      if (sendRes.ok) {
        const sendData = await sendRes.json();
        whatsappMsgId = sendData?.key?.id || null;
      } else {
        const errText = await sendRes.text();
        console.error(`Send error for ${group.group_name}: ${sendRes.status} ${errText}`);
        result.error = `Send failed for ${group.group_name}`;
        return result;
      }

      await supabaseAdmin.from("agent_messages").insert({
        org_id: orgId,
        prospection_group_id: group.id,
        message_text: decision.message,
        message_type: "followup",
        delivered: true,
        whatsapp_message_id: whatsappMsgId,
      });

      await supabaseAdmin
        .from("agent_pending_followups")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("prospection_group_id", group.id)
        .eq("status", "pending");

      await supabaseAdmin
        .from("prospection_groups")
        .update({ last_agent_check_at: new Date().toISOString() })
        .eq("id", group.id);

      result.messagesSent = 1;
    } else {
      // Check for pending followups
      const lastAgentMsg = prevAgentMsgs?.[0];
      if (lastAgentMsg) {
        const hoursSinceAgent = (Date.now() - new Date(lastAgentMsg.sent_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceAgent > 24) {
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

      await supabaseAdmin
        .from("prospection_groups")
        .update({ last_agent_check_at: new Date().toISOString() })
        .eq("id", group.id);
    }
  } catch (groupErr) {
    console.error(`Error processing group ${group.id}:`, groupErr);
    result.error = `Error for ${group.group_name}: ${groupErr instanceof Error ? groupErr.message : "unknown"}`;
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { orgId, groupId, batch_size, offset, execution_id, batch_number } = body;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Missing orgId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const effectiveBatchSize = batch_size || DEFAULT_BATCH_SIZE;
    const effectiveOffset = offset || 0;
    const executionId = execution_id || crypto.randomUUID();
    const currentBatchNumber = batch_number || 1;

    // Fetch configs in parallel
    const [evoConfigRes, anthropicKeyRes, instanceRes, schedConfigRes] = await Promise.all([
      supabaseAdmin.from("evolution_api_configs").select("api_url, api_key").eq("org_id", orgId).single(),
      supabaseAdmin.from("org_api_keys").select("api_key").eq("org_id", orgId).eq("provider", "anthropic").single(),
      supabaseAdmin.from("whatsapp_instances").select("instance_name, phone_number").eq("org_id", orgId).eq("instance_type", "master").eq("status", "connected").limit(1).single(),
      supabaseAdmin.from("agent_schedule_config").select("agent_instructions").eq("org_id", orgId).single(),
    ]);

    const evoConfig = evoConfigRes.data;
    if (!evoConfig) {
      return new Response(JSON.stringify({ error: "Evolution API not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let apiKey = evoConfig.api_key;
    if (apiKey === "***vault***") {
      const { data: vaultKey } = await supabaseAdmin.rpc("get_vault_secret", { p_name: `evo_api_key_${orgId}` });
      if (vaultKey) apiKey = vaultKey;
    }

    let anthropicKey = anthropicKeyRes.data?.api_key || "";
    if (anthropicKey === "***vault***") {
      const { data: vaultKey } = await supabaseAdmin.rpc("get_vault_secret", { p_name: `anthropic_key_${orgId}` });
      if (vaultKey) anthropicKey = vaultKey;
    }

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Anthropic API key not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instance = instanceRes.data;
    if (!instance) {
      return new Response(JSON.stringify({ error: "No connected WhatsApp instance" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agentInstructions = (schedConfigRes.data as any)?.agent_instructions || "Você é um analista comercial.";

    // Fetch prospection groups — only this batch
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    let groupsQuery = supabaseAdmin
      .from("prospection_groups")
      .select("id, group_name, current_stage, prospect_name, prospect_company, whatsapp_group_id, priority, notes, last_agent_check_at")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .not("current_stage", "in", "(deal_won,deal_lost)")
      .order("last_agent_check_at", { ascending: true, nullsFirst: true });

    if (groupId) {
      groupsQuery = groupsQuery.eq("id", groupId);
    } else {
      groupsQuery = groupsQuery.or(`last_agent_check_at.is.null,last_agent_check_at.lt.${threeHoursAgo}`);
    }

    groupsQuery = groupsQuery.range(effectiveOffset, effectiveOffset + effectiveBatchSize - 1);
    const { data: groups } = await groupsQuery;

    if (!groups || groups.length === 0) {
      // No more groups — this is the final batch, log execution
      if (currentBatchNumber > 1) {
        console.log(`[AGENT] Batch ${currentBatchNumber}: no more groups. Execution ${executionId} complete.`);
      }
      const executionTimestamp = new Date().toISOString();
      await supabaseAdmin.from("agent_execution_logs").insert({
        org_id: orgId, groups_checked: 0, messages_sent: 0, status: "success",
        executed_at: executionTimestamp,
      });
      await supabaseAdmin.from("agent_schedule_config").update({ updated_at: executionTimestamp }).eq("org_id", orgId);

      return new Response(JSON.stringify({
        execution_id: executionId,
        batch_number: currentBatchNumber,
        groups_checked: 0, messages_sent: 0, stage_updates: 0,
        completed: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[AGENT] Batch ${currentBatchNumber}: processing ${groups.length} groups (offset=${effectiveOffset})`);

    let totalMessagesSent = 0;
    let stageUpdates = 0;
    const errors: string[] = [];
    const batchReports: any[] = [];

    // Process groups sequentially with delay
    for (const group of groups) {
      const stageBefore = group.current_stage;
      const r = await processGroup(group, supabaseAdmin, evoConfig, apiKey, anthropicKey, instance, agentInstructions, orgId);

      totalMessagesSent += r.messagesSent;
      if (r.stageUpdated) stageUpdates++;
      if (r.error) errors.push(r.error);

      // Determine action and stage_after
      let action = "sem_acao";
      if (r.error) action = "erro";
      else if (r.messagesSent > 0) action = "mensagem_enviada";

      const stageAfter = r.decision?.suggested_stage && r.stageUpdated
        ? r.decision.suggested_stage
        : null;

      batchReports.push({
        org_id: orgId,
        execution_id: executionId,
        batch_number: currentBatchNumber,
        group_name: group.group_name,
        action,
        message_sent: r.decision?.should_send ? r.decision?.message || null : null,
        stage_before: stageBefore,
        stage_after: stageAfter,
        reasoning: r.decision?.reasoning || r.error || "",
        processed_at: new Date().toISOString(),
      });

      await delay(DELAY_BETWEEN_GROUPS_MS);
    }

    // Insert batch reports
    if (batchReports.length > 0) {
      const { error: reportErr } = await supabaseAdmin.from("agent_batch_reports").insert(batchReports);
      if (reportErr) console.error("[BATCH REPORTS] Insert error:", reportErr);
    }

    // Log this batch execution
    const executionTimestamp = new Date().toISOString();
    await supabaseAdmin.from("agent_execution_logs").insert({
      org_id: orgId,
      groups_checked: groups.length,
      messages_sent: totalMessagesSent,
      status: errors.length > 0 ? "partial_error" : "success",
      error_log: errors.length > 0 ? errors.join("; ") : null,
      executed_at: executionTimestamp,
    });
    await supabaseAdmin.from("agent_schedule_config").update({ updated_at: executionTimestamp }).eq("org_id", orgId);

    // Check if there are more groups — if so, invoke self for next batch (fire-and-forget)
    const hasMore = groups.length === effectiveBatchSize;
    let nextBatchTriggered = false;

    if (hasMore && !groupId) {
      console.log(`[AGENT] Batch ${currentBatchNumber} done. Triggering batch ${currentBatchNumber + 1} (fire-and-forget)...`);
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        
        // Fire-and-forget: don't await the response, just ensure the request is sent
        const fetchPromise = fetch(`${supabaseUrl}/functions/v1/prospection-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            orgId,
            batch_size: effectiveBatchSize,
            offset: effectiveOffset + effectiveBatchSize,
            execution_id: executionId,
            batch_number: currentBatchNumber + 1,
          }),
        });
        
        // Wait just enough to ensure the request is dispatched, not for the full response
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));
        await Promise.race([fetchPromise.then(() => { nextBatchTriggered = true; }), timeoutPromise.then(() => { nextBatchTriggered = true; })]);
        
        console.log(`[AGENT] Next batch request dispatched successfully`);
      } catch (chainErr) {
        console.error(`[AGENT] Error chaining batch ${currentBatchNumber + 1}:`, chainErr);
      }
    }

    return new Response(JSON.stringify({
      execution_id: executionId,
      batch_number: currentBatchNumber,
      groups_checked: groups.length,
      messages_sent: totalMessagesSent,
      stage_updates: stageUpdates,
      completed: !hasMore,
      next_batch_triggered: nextBatchTriggered,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("prospection-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
