
-- Update analyses SELECT policy to be per-user
DROP POLICY IF EXISTS "Members can view analyses" ON public.analyses;
CREATE POLICY "Users can view own analyses"
ON public.analyses FOR SELECT
USING (auth.uid() = created_by);

-- Update context_blocks SELECT policy to be per-user (through analysis owner)
DROP POLICY IF EXISTS "Members can view context blocks" ON public.context_blocks;
CREATE POLICY "Users can view own context blocks"
ON public.context_blocks FOR SELECT
USING (EXISTS (
  SELECT 1 FROM analyses a
  WHERE a.id = context_blocks.analysis_id
  AND a.created_by = auth.uid()
));

-- Allow edge function to insert context_blocks (service role handles this, but add policy for completeness)
CREATE POLICY "Users can insert own context blocks"
ON public.context_blocks FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM analyses a
  WHERE a.id = context_blocks.analysis_id
  AND a.created_by = auth.uid()
));
