
-- Allow org members to view profiles of other members in the same org
CREATE POLICY "Org members can view fellow member profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM org_members om1
    JOIN org_members om2 ON om1.org_id = om2.org_id
    WHERE om1.user_id = auth.uid()
      AND om2.user_id = profiles.user_id
  )
);
