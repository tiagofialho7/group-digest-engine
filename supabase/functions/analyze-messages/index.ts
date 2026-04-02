import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request
    const { group_id, analysis_id, period_start, period_end, custom_rules, org_id } = await req.json();

    // Get messages for the period
    const { data: messages, error: msgError } = await supabaseUser
      .from("messages")
      .select("*")
      .eq("group_id", group_id)
      .gte("sent_at", period_start)
      .lte("sent_at", period_end)
      .order("sent_at", { ascending: true });

    if (msgError) throw msgError;

    if (!messages || messages.length === 0) {
      // Update analysis status
      await supabaseUser.from("analyses").update({ status: "completed" }).eq("id", analysis_id);
      return new Response(JSON.stringify({ message: "Nenhuma mensagem encontrada no período.", context_blocks: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format messages for AI with explicit IDs
    const formattedMessages = messages.map((m: any) => 
      `[ID:${m.id}] [${new Date(m.sent_at).toLocaleString("pt-BR")}] ${m.sender_name}: ${m.content}`
    ).join("\n");

    // Build ID lookup for validation
    const validIds = new Set(messages.map((m: any) => m.id));

    const hasRules = custom_rules?.length > 0;
    const rulesText = hasRules
      ? `\n\nRegras configuradas pelo usuário (siga-as com prioridade):\n${custom_rules.map((r: string) => `- ${r}`).join("\n")}`
      : "";

    // Determine analysis mode based on rules
    const hasQuestionFocusRule = hasRules && custom_rules.some((r: string) => 
      /pergunt|dúvid|ajuda|suporte|question/i.test(r)
    );

    const analysisInstructions = hasQuestionFocusRule
      ? `Foque principalmente em perguntas, dúvidas e pedidos de ajuda. Descarte mensagens puramente sociais e saudações.`
      : `Faça um resumo GERAL de toda a conversa, cobrindo todos os tipos de mensagem relevantes:
- Discussões e debates
- Decisões tomadas
- Informações compartilhadas
- Perguntas e respostas
- Anúncios e avisos
- Feedbacks e opiniões
Descarte apenas ruído puro (emojis isolados, "ok", "👍" sem contexto).`;

    // Send to AI for analysis
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um analisador de conversas de grupos WhatsApp. Sua tarefa é:

1. Analisar as mensagens e organizá-las por tópicos/temas.
2. Para cada tópico, identificar se houve respostas ou conclusões.
3. Gerar resumos claros e concisos por tópico.

${analysisInstructions}

IMPORTANTE: Cada mensagem possui um identificador único no formato [ID:uuid]. Use esses IDs para referenciar as mensagens relevantes.

Regras de organização:
- Agrupe mensagens do mesmo tema/assunto em um bloco
- Identifique quem iniciou a discussão e quem respondeu
- Preserve autores das mensagens
- Se uma pergunta foi respondida, marque como respondida e identifique quem respondeu
- Cada bloco deve ter um título descritivo e um resumo claro${rulesText}

Responda APENAS com um JSON válido no formato:
{
  "context_blocks": [
    {
      "title": "Título do tópico",
      "summary": "Resumo da discussão/conteúdo",
      "message_count": 5,
      "is_answered": true,
      "answered_by": "Nome da pessoa que respondeu (se aplicável)",
      "answer_summary": "Resumo da resposta/conclusão (se aplicável)",
      "relevant_message_ids": ["id-da-mensagem-1", "id-da-mensagem-2"]
    }
  ]
}

ATENÇÃO: No campo "relevant_message_ids", use EXATAMENTE os IDs que aparecem no prefixo [ID:...] de cada mensagem. NÃO invente IDs.

Se não houver conteúdo relevante, retorne: {"context_blocks": []}`,
          },
          {
            role: "user",
            content: `Analise estas ${messages.length} mensagens:\n\n${formattedMessages}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      await supabaseUser.from("analyses").update({ status: "failed" }).eq("id", analysis_id);
      return new Response(JSON.stringify({ error: "Erro na análise de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";

    // Parse AI response
    let parsed;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse AI response:", content);
      parsed = { context_blocks: [] };
    }

    // Store context blocks
    const contextBlocks = parsed.context_blocks || [];
    for (const block of contextBlocks) {
      // Use direct IDs from AI response, validating they exist
      const messageIds = (block.relevant_message_ids || [])
        .filter((id: string) => validIds.has(id));

      await supabaseUser.from("context_blocks").insert({
        analysis_id,
        title: block.title,
        summary: block.summary,
        message_count: block.message_count || messageIds.length,
        is_answered: block.is_answered || false,
        answered_by: block.answered_by || null,
        answer_summary: block.answer_summary || null,
        message_ids: messageIds,
      });
    }

    // Update analysis status
    await supabaseUser.from("analyses").update({ status: "completed" }).eq("id", analysis_id);

    return new Response(JSON.stringify({ success: true, blocks_created: contextBlocks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
