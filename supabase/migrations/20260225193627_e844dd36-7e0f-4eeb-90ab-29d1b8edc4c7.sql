
-- Remove overly permissive policy (service role bypasses RLS anyway)
DROP POLICY IF EXISTS "Service role full access to knowledge chunks" ON public.knowledge_chunks;
