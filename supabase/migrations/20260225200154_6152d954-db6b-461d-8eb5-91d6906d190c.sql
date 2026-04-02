
-- Remove overly permissive policy (service_role key bypasses RLS anyway)
DROP POLICY "Service role can manage contact profiles" ON public.contact_profiles;
