
-- 1. Fix webhook_logs: restrict SELECT to org admins only
DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.webhook_logs;
CREATE POLICY "Admins can view webhook logs" ON public.webhook_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.role = 'admin'
    )
  );

-- 2. Fix system_settings: restrict writes to admins only, keep public read
DROP POLICY IF EXISTS "Authenticated can modify system_settings" ON public.system_settings;

CREATE POLICY "Admins can modify system_settings" ON public.system_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.role = 'admin'
    )
  );

-- 3. Fix knowledge-files storage: add org membership checks
DROP POLICY IF EXISTS "Org members can read knowledge files" ON storage.objects;
CREATE POLICY "Org members can read knowledge files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.knowledge_files kf
      JOIN public.knowledge_bases kb ON kb.id = kf.knowledge_base_id
      JOIN public.org_members om ON om.org_id = kb.org_id
      WHERE om.user_id = auth.uid()
        AND kf.file_path = name
    )
  );

DROP POLICY IF EXISTS "Authenticated users can upload knowledge files" ON storage.objects;
CREATE POLICY "Org members can upload knowledge files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can delete knowledge files" ON storage.objects;
CREATE POLICY "Org admins can delete knowledge files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.knowledge_files kf
      JOIN public.knowledge_bases kb ON kb.id = kf.knowledge_base_id
      JOIN public.org_members om ON om.org_id = kb.org_id
      WHERE om.user_id = auth.uid()
        AND om.role = 'admin'
        AND kf.file_path = name
    )
  );
