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
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");
    const jwt = authHeader.replace("Bearer ", "");

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(jwt);
    if (userErr || !user) throw new Error("Não autorizado");

    const { group_id, summary_date } = await req.json();
    if (!group_id || !summary_date) throw new Error("group_id e summary_date são obrigatórios");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: group, error: groupErr } = await supabaseAdmin
      .from("monitored_groups")
      .select("id, name, org_id")
      .eq("id", group_id)
      .single();

    if (groupErr || !group) throw new Error("Grupo não encontrado");

    const { data: membership } = await supabaseAdmin
      .from("org_members")
      .select("id")
      .eq("org_id", group.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) throw new Error("Sem permissão");

    const dayStart = `${summary_date}T00:00:00.000Z`;
    const dayEnd = `${summary_date}T23:59:59.999Z`;

    const { data: messages, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("id, content, sender_name, sender_phone, sent_at, message_type, quoted_content, quoted_sender, reply_to_whatsapp_id")
      .eq("group_id", group_id)
      .gte("sent_at", dayStart)
      .lte("sent_at", dayEnd)
      .order("sent_at", { ascending: true });

    if (msgErr) throw msgErr;

    if (!messages || messages.length === 0) {
      const emptyContent = {
        total_messages: 0,
        overview: "Nenhuma mensagem encontrada nesta data.",
        topics: [],
        top_contributors: [],
        stats: { total_questions: 0, answered: 0, unanswered: 0, media_shared: 0 },
        engagement: { active_participants: 0, peak_hour: null, messages_per_hour: [], avg_response_time_min: null },
        sentiment: { positive: 0, neutral: 0, negative: 0 },
        highlights: [],
        action_items: [],
      };

      await supabaseAdmin.from("daily_summaries").upsert({
        group_id, summary_date, content: emptyContent, created_by: user.id,
      }, { onConflict: "group_id,summary_date" });

      return new Response(JSON.stringify({ success: true, summary: emptyContent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also get existing analyses + context blocks for enrichment
    const { data: analyses } = await supabaseAdmin
      .from("analyses")
      .select("id, status, period_start")
      .eq("group_id", group_id)
      .eq("status", "completed")
      .gte("period_start", dayStart)
      .lte("period_start", dayEnd);

    let existingBlocks: any[] = [];
    if (analyses?.length) {
      const aIds = analyses.map(a => a.id);
      const { data: blocks } = await supabaseAdmin
        .from("context_blocks")
        .select("title, summary, is_answered, answered_by, answer_summary, message_count")
        .in("analysis_id", aIds);
      existingBlocks = blocks || [];
    }

    const formattedMessages = messages.map((m: any) =>
      `[${new Date(m.sent_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}] ${m.sender_name}: ${m.content}${m.quoted_sender ? ` (respondendo ${m.quoted_sender})` : ""}`
    ).join("\n");

    const existingAnalysisContext = existingBlocks.length > 0
      ? `\n\nAnálises prévias já identificaram estes temas:\n${existingBlocks.map(b =>
          `- ${b.title}: ${b.summary} (${b.is_answered ? `Respondido por ${b.answered_by}` : 'Pendente'})`
        ).join("\n")}`
      : "";

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
            content: `Você é um analista de dados de conversas WhatsApp. Gere métricas ricas e acionáveis.

Analise as mensagens e produza um relatório com:

1. **overview**: Parágrafo curto (2-3 frases) resumindo o dia
2. **total_messages**: Número total de mensagens
3. **topics**: Lista dos temas discutidos com status
4. **stats**: Métricas quantitativas
5. **top_contributors**: Ranking dos participantes mais valiosos (não apenas volume, mas qualidade das contribuições — quem resolveu problemas, trouxe informações úteis, ajudou outros)
6. **engagement**: Dados de engajamento do grupo
7. **sentiment**: Análise de sentimento geral com até 5 mensagens representativas por categoria (positive, neutral, negative) no campo "examples"
8. **highlights**: Insights e decisões importantes
9. **action_items**: Tarefas ou pendências identificadas

${existingAnalysisContext}

Responda APENAS com JSON válido:
{
  "overview": "string",
  "total_messages": number,
  "topics": [
    {
      "title": "string",
      "summary": "string curto",
      "status": "resolved" | "pending" | "in_progress",
      "participants": ["Nome1"],
      "message_count": number
    }
  ],
  "stats": {
    "total_questions": number,
    "answered": number,
    "unanswered": number,
    "media_shared": number
  },
  "top_contributors": [
    {
      "name": "string",
      "messages_sent": number,
      "questions_answered": number,
      "helpfulness_score": number (1-10, baseado na qualidade e impacto das contribuições),
      "role_tag": "🧠 Especialista" | "🔥 Engajado" | "🎯 Solucionador" | "💬 Comunicador" | "📚 Mentor"
    }
  ],
  "engagement": {
    "active_participants": number,
    "peak_hour": "HH:mm" | null,
    "messages_per_hour": [{"hour": "HH:mm", "count": number}],
    "avg_response_time_min": number | null
  },
  "sentiment": {
    "positive": number (0-100),
    "neutral": number (0-100),
    "negative": number (0-100),
    "context": {
      "positive": "1-2 frases explicando POR QUE as mensagens são positivas (ex: 'Membros demonstraram satisfação com soluções rápidas e agradeceram a ajuda da comunidade')",
      "neutral": "1-2 frases explicando o contexto neutro (ex: 'Conversas informativas sem polaridade, como troca de procedimentos e confirmações')",
      "negative": "1-2 frases explicando o motivo da insatisfação (ex: 'Frustração com demora nas respostas e reclamações sobre bugs recorrentes')"
    },
    "examples": {
      "positive": [{"sender": "Nome", "content": "mensagem representativa", "time": "HH:mm"}],
      "neutral": [{"sender": "Nome", "content": "mensagem representativa", "time": "HH:mm"}],
      "negative": [{"sender": "Nome", "content": "mensagem representativa", "time": "HH:mm"}]
    }
  },
  "highlights": ["string"],
  "action_items": [
    {
      "description": "string",
      "assignee": "string" | null,
      "priority": "high" | "medium" | "low"
    }
  ]
}`,
          },
          {
            role: "user",
            content: `Grupo: ${group.name}\nData: ${summary_date}\n${messages.length} mensagens:\n\n${formattedMessages}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erro ao gerar resumo com IA");
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Erro ao processar resposta da IA");
    }

    await supabaseAdmin.from("daily_summaries").upsert({
      group_id, summary_date, content: parsed, created_by: user.id,
    }, { onConflict: "group_id,summary_date" });

    return new Response(JSON.stringify({ success: true, summary: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-daily-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
