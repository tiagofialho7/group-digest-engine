// deno-lint-ignore-file no-explicit-any
// @ts-nocheck - Supabase.ai is a runtime-only API available in Supabase Edge Functions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate embedding for query using Supabase built-in AI
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const session = new (globalThis as any).Supabase.ai.Session("gte-small");
  const output = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(output as Float32Array);
}

// Fetch relevant knowledge context using semantic search
async function fetchKnowledgeContext(
  sbAdmin: any,
  groupId: string,
  queryText: string
): Promise<string> {
  try {
    const { data: links } = await sbAdmin
      .from("group_knowledge_bases")
      .select("knowledge_base_id")
      .eq("group_id", groupId);

    if (!links || links.length === 0) return "";

    const kbIds = links.map((l: any) => l.knowledge_base_id);

    const queryEmbedding = await generateQueryEmbedding(queryText);

    const { data: chunks, error } = await sbAdmin.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.3,
      match_count: 5,
      filter_kb_ids: kbIds,
    });

    if (error) {
      console.error("Semantic search error:", error);
      return await fallbackKeywordSearch(sbAdmin, kbIds, queryText);
    }

    if (chunks && chunks.length > 0) {
      const snippets = chunks.map((c: any) =>
        `[Similaridade: ${(c.similarity * 100).toFixed(0)}%]\n${c.content}`
      );
      return "\n\n--- CONTEXTO DA BASE DE CONHECIMENTO (Busca Semântica) ---\nUse as informações abaixo como referência para responder:\n\n" + snippets.join("\n\n---\n\n");
    }

    return await fallbackKeywordSearch(sbAdmin, kbIds, queryText);
  } catch (err) {
    console.error("KB context fetch error:", err);
    return "";
  }
}

// Fallback keyword search
async function fallbackKeywordSearch(
  sbAdmin: any,
  kbIds: string[],
  queryText: string
): Promise<string> {
  const { data: files } = await sbAdmin
    .from("knowledge_files")
    .select("file_name, content_text")
    .in("knowledge_base_id", kbIds)
    .not("content_text", "is", null);

  if (!files || files.length === 0) return "";

  const queryWords = queryText.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
  const scoredFiles = files.map((f: any) => {
    const text = (f.content_text || "").toLowerCase();
    const score = queryWords.reduce((s: number, w: string) => s + (text.includes(w) ? 1 : 0), 0);
    return { ...f, score };
  }).sort((a: any, b: any) => b.score - a.score);

  const relevant = scoredFiles.slice(0, 3).filter((f: any) => f.score > 0 || files.length <= 3);
  if (relevant.length === 0) return "";

  const snippets = relevant.map((f: any) => {
    const text = f.content_text || "";
    const truncated = text.length > 2000 ? text.substring(0, 2000) + "..." : text;
    return `[${f.file_name}]\n${truncated}`;
  });
  return "\n\n--- CONTEXTO DA BASE DE CONHECIMENTO ---\nUse as informações abaixo como referência para responder:\n\n" + snippets.join("\n\n");
}

// Extract user query text from messages
function extractQueryText(messages: any[]): string {
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
  if (!lastUserMsg) return "";
  return typeof lastUserMsg.content === "string"
    ? lastUserMsg.content
    : (lastUserMsg.content?.map((p: any) => p.text || "").join(" ") || "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, model, org_id, group_id } = await req.json();

    let kbContext = "";
    if (group_id) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const queryText = extractQueryText(messages);
      if (queryText) {
        kbContext = await fetchKnowledgeContext(sbAdmin, group_id, queryText);
      }
    }

    const isAnthropicModel = model?.startsWith("claude-") || model?.startsWith("anthropic/");

    if (isAnthropicModel) {
      if (!org_id) throw new Error("org_id é obrigatório para modelos Anthropic");

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Get Anthropic API key from vault
      const { data: vaultAnthropicKey } = await sb.rpc('get_vault_secret', { p_name: `anthropic_key_${org_id}` });

      if (!vaultAnthropicKey) throw new Error("API Key Anthropic não configurada. Vá em Configurações.");

      const anthropicModel = model.replace("anthropic/", "");
      const systemMsg = messages.find((m: any) => m.role === "system");
      const nonSystemMsgs = messages.filter((m: any) => m.role !== "system");

      const baseSystemContent = systemMsg
        ? (typeof systemMsg.content === "string" ? systemMsg.content : systemMsg.content.map((p: any) => p.text || "").join("\n"))
        : "Você é um assistente de IA integrado ao GroupLens, uma plataforma de análise de grupos WhatsApp. Responda de forma clara, profissional e em português brasileiro.";
      const systemContent = baseSystemContent + kbContext;

      const anthropicMessages = nonSystemMsgs.map((m: any) => {
        if (typeof m.content === "string") return m;
        const content = m.content.map((part: any) => {
          if (part.type === "text") return { type: "text", text: part.text };
          if (part.type === "image_url") {
            return { type: "text", text: `[Imagem disponível em: ${part.image_url.url}]` };
          }
          return part;
        });
        return { ...m, content };
      });

      const anthropicBody: any = {
        model: anthropicModel,
        max_tokens: 4096,
        stream: true,
        system: systemContent,
        messages: anthropicMessages,
      };

      const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": vaultAnthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(anthropicBody),
      });

      if (!anthropicResp.ok) {
        const errText = await anthropicResp.text();
        console.error("Anthropic error:", anthropicResp.status, errText);
        if (anthropicResp.status === 401) {
          return new Response(JSON.stringify({ error: "API Key Anthropic inválida" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "Erro na API Anthropic" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const reader = anthropicResp.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let nl;
              while ((nl = buffer.indexOf("\n")) !== -1) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (!line.startsWith("data: ")) continue;
                const jsonStr = line.slice(6);
                try {
                  const event = JSON.parse(jsonStr);
                  if (event.type === "content_block_delta" && event.delta?.text) {
                    const openaiChunk = { choices: [{ delta: { content: event.delta.text }, index: 0 }] };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
                  } else if (event.type === "error") {
                    console.error("Anthropic stream error:", JSON.stringify(event));
                    const errMsg = event.error?.type === "overloaded_error"
                      ? "Anthropic está sobrecarregada. Tente novamente em alguns segundos."
                      : event.error?.message || "Erro na API Anthropic";
                    const errorChunk = { choices: [{ delta: { content: `⚠️ ${errMsg}` }, index: 0 }] };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  } else if (event.type === "message_stop") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  }
                } catch { /* ignore parse errors */ }
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (e) {
            console.error("Stream error:", e);
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Default: Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um assistente de IA integrado ao GroupLens, uma plataforma de análise de grupos WhatsApp. Responda de forma clara, profissional e em português brasileiro. Use o contexto da discussão fornecida para dar respostas precisas e úteis." + kbContext },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
