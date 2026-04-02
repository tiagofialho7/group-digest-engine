// deno-lint-ignore-file no-explicit-any
// @ts-nocheck - Supabase.ai is a runtime-only API available in Supabase Edge Functions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Chunk text into overlapping segments
function chunkText(text: string, chunkSize = 400, overlap = 80): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  if (words.length <= chunkSize) {
    if (words.join(" ").trim().length > 20) chunks.push(words.join(" ").trim());
    return chunks;
  }
  let i = 0;
  while (i < words.length) {
    const end = Math.min(i + chunkSize, words.length);
    const chunk = words.slice(i, end).join(" ").trim();
    if (chunk.length > 20) chunks.push(chunk);
    i += chunkSize - overlap;
    if (end === words.length) break;
  }
  return chunks;
}

// Generate embedding using Supabase built-in AI
async function generateEmbedding(text: string): Promise<number[]> {
  const session = new (globalThis as any).Supabase.ai.Session("gte-small");
  const output = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(output as Float32Array);
}

// Max chunks per invocation to avoid CPU limits
const MAX_CHUNKS_PER_CALL = 2;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { knowledge_base_id, knowledge_file_id, content_text, start_index } = await req.json();

    if (!knowledge_base_id || !knowledge_file_id || !content_text) {
      throw new Error("knowledge_base_id, knowledge_file_id, and content_text are required");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const startIdx = start_index || 0;

    if (startIdx === 0) {
      await sb.from("knowledge_chunks").delete().eq("knowledge_file_id", knowledge_file_id);
    }

    const allChunks = chunkText(content_text);
    const chunksToProcess = allChunks.slice(startIdx, startIdx + MAX_CHUNKS_PER_CALL);

    console.log(`Processing chunks ${startIdx}-${startIdx + chunksToProcess.length - 1} of ${allChunks.length} for file ${knowledge_file_id}`);

    for (let i = 0; i < chunksToProcess.length; i++) {
      const chunkIndex = startIdx + i;
      try {
        const embedding = await generateEmbedding(chunksToProcess[i]);
        await sb.from("knowledge_chunks").insert({
          knowledge_base_id,
          knowledge_file_id,
          chunk_index: chunkIndex,
          content: chunksToProcess[i],
          embedding: JSON.stringify(embedding),
        });
      } catch (embErr) {
        console.error(`Error on chunk ${chunkIndex}:`, embErr);
        await sb.from("knowledge_chunks").insert({
          knowledge_base_id,
          knowledge_file_id,
          chunk_index: chunkIndex,
          content: chunksToProcess[i],
          embedding: null,
        });
      }
    }

    const nextIndex = startIdx + MAX_CHUNKS_PER_CALL;
    if (nextIndex < allChunks.length) {
      try {
        const nextResp = await fetch(`${SUPABASE_URL}/functions/v1/generate-embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            knowledge_base_id,
            knowledge_file_id,
            content_text,
            start_index: nextIndex,
          }),
        });
        console.log(`Scheduled next batch starting at ${nextIndex}, status: ${nextResp.status}`);
      } catch (err) {
        console.error("Failed to schedule next batch:", err);
      }

      return new Response(
        JSON.stringify({ success: true, processed: chunksToProcess.length, remaining: allChunks.length - nextIndex, total: allChunks.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Completed all ${allChunks.length} chunks for file ${knowledge_file_id}`);
    return new Response(
      JSON.stringify({ success: true, chunks_count: allChunks.length, completed: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-embeddings error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
