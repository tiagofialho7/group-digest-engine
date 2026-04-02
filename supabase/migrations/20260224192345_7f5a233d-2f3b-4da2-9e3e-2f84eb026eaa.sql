
-- Allow creators to see their own orgs (needed for insert...returning)
DROP POLICY "Members can view their orgs" ON public.organizations;
CREATE POLICY "Members can view their orgs" ON public.organizations
  FOR SELECT USING (public.is_org_member(auth.uid(), id) OR auth.uid() = created_by);
