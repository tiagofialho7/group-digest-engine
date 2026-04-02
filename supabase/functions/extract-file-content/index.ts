import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_path, knowledge_base_id, file_name } = await req.json();
    if (!file_path || !file_name) throw new Error("file_path and file_name are required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Download file from storage
    const { data: fileData, error: downloadError } = await sb.storage
      .from("knowledge-files")
      .download(file_path);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      throw new Error("Failed to download file");
    }

    let contentText = "";
    const ext = file_name.toLowerCase().split(".").pop() || "";

    if (["txt", "md", "csv", "json", "log"].includes(ext)) {
      contentText = await fileData.text();
    } else if (ext === "pdf") {
      // Basic PDF text extraction - extract readable text between stream markers
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      // Extract text between BT/ET markers and parentheses
      const textParts: string[] = [];
      const regex = /\(([^)]*)\)/g;
      let match;
      while ((match = regex.exec(rawText)) !== null) {
        const cleaned = match[1].replace(/\\n/g, "\n").replace(/\\\\/g, "\\").replace(/\\([()])/g, "$1");
        if (cleaned.trim().length > 1) textParts.push(cleaned);
      }
      contentText = textParts.join(" ").trim();
      if (!contentText) {
        contentText = "[PDF sem texto extraível - conteúdo pode ser imagem]";
      }
    } else {
      // Try to read as text
      try {
        contentText = await fileData.text();
      } catch {
        contentText = "[Formato não suportado para extração de texto]";
      }
    }

    // Remove null bytes that Postgres can't store
    contentText = contentText.replace(/\0/g, "");

    // Truncate if too large (max 500KB of text)
    if (contentText.length > 500000) {
      contentText = contentText.substring(0, 500000) + "\n[...conteúdo truncado]";
    }

    // Update knowledge_file with extracted content
    const { data: updatedFile, error: updateError } = await sb
      .from("knowledge_files")
      .update({ content_text: contentText })
      .eq("knowledge_base_id", knowledge_base_id)
      .eq("file_name", file_name)
      .select("id")
      .single();

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error("Failed to update content_text");
    }

    // Trigger embedding generation for RAG
    if (updatedFile && contentText && contentText.length > 20) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await fetch(`${SUPABASE_URL}/functions/v1/generate-embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            knowledge_base_id,
            knowledge_file_id: updatedFile.id,
            content_text: contentText,
          }),
        });
        console.log("Triggered embedding generation for file:", file_name);
      } catch (embErr) {
        console.error("Failed to trigger embeddings:", embErr);
      }
    }

    return new Response(JSON.stringify({ success: true, chars: contentText.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-file-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
