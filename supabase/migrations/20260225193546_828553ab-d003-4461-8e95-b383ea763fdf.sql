
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create knowledge_chunks table for RAG
CREATE TABLE public.knowledge_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  knowledge_file_id UUID NOT NULL REFERENCES public.knowledge_files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  embedding vector(384),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for vector similarity search
CREATE INDEX knowledge_chunks_embedding_idx ON public.knowledge_chunks 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index for lookups
CREATE INDEX knowledge_chunks_kb_id_idx ON public.knowledge_chunks(knowledge_base_id);
CREATE INDEX knowledge_chunks_file_id_idx ON public.knowledge_chunks(knowledge_file_id);

-- Enable RLS
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read chunks via knowledge_bases -> org membership
CREATE POLICY "Org members can view knowledge chunks"
  ON public.knowledge_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_bases kb
      JOIN public.org_members om ON om.org_id = kb.org_id
      WHERE kb.id = knowledge_chunks.knowledge_base_id
        AND om.user_id = auth.uid()
    )
  );

-- Service role can insert/update/delete (edge functions use service role)
CREATE POLICY "Service role full access to knowledge chunks"
  ON public.knowledge_chunks FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create match function for semantic search
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(384),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5,
  filter_kb_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  knowledge_base_id UUID,
  knowledge_file_id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.knowledge_base_id,
    kc.knowledge_file_id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
    AND (filter_kb_ids IS NULL OR kc.knowledge_base_id = ANY(filter_kb_ids))
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
