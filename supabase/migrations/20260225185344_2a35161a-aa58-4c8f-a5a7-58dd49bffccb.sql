
-- 1. Knowledge Bases table
CREATE TABLE public.knowledge_bases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view knowledge bases"
  ON public.knowledge_bases FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can create knowledge bases"
  ON public.knowledge_bases FOR INSERT
  WITH CHECK (has_org_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins can update knowledge bases"
  ON public.knowledge_bases FOR UPDATE
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins can delete knowledge bases"
  ON public.knowledge_bases FOR DELETE
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role));

CREATE TRIGGER update_knowledge_bases_updated_at
  BEFORE UPDATE ON public.knowledge_bases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Knowledge Files table
CREATE TABLE public.knowledge_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_text TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_type TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view knowledge files"
  ON public.knowledge_files FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE kb.id = knowledge_files.knowledge_base_id
    AND is_org_member(auth.uid(), kb.org_id)
  ));

CREATE POLICY "Admins can create knowledge files"
  ON public.knowledge_files FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE kb.id = knowledge_files.knowledge_base_id
    AND has_org_role(auth.uid(), kb.org_id, 'admin'::app_role)
  ));

CREATE POLICY "Admins can delete knowledge files"
  ON public.knowledge_files FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE kb.id = knowledge_files.knowledge_base_id
    AND has_org_role(auth.uid(), kb.org_id, 'admin'::app_role)
  ));

-- 3. Group <-> Knowledge Base junction table
CREATE TABLE public.group_knowledge_bases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.monitored_groups(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, knowledge_base_id)
);

ALTER TABLE public.group_knowledge_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view group knowledge bases"
  ON public.group_knowledge_bases FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.monitored_groups mg
    WHERE mg.id = group_knowledge_bases.group_id
    AND is_org_member(auth.uid(), mg.org_id)
  ));

CREATE POLICY "Admins can link knowledge bases"
  ON public.group_knowledge_bases FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.monitored_groups mg
    WHERE mg.id = group_knowledge_bases.group_id
    AND has_org_role(auth.uid(), mg.org_id, 'admin'::app_role)
  ));

CREATE POLICY "Admins can unlink knowledge bases"
  ON public.group_knowledge_bases FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.monitored_groups mg
    WHERE mg.id = group_knowledge_bases.group_id
    AND has_org_role(auth.uid(), mg.org_id, 'admin'::app_role)
  ));

-- 4. Storage bucket for knowledge files (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-files', 'knowledge-files', false);

-- Storage policies: org members can read, admins can upload/delete
CREATE POLICY "Org members can read knowledge files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-files');

CREATE POLICY "Authenticated users can upload knowledge files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete knowledge files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-files' AND auth.role() = 'authenticated');
