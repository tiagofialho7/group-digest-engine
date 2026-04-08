
CREATE TABLE public.prospection_context (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prospection_group_id uuid NOT NULL UNIQUE REFERENCES public.prospection_groups(id) ON DELETE CASCADE,
  context_summary text DEFAULT '',
  pending_actions text DEFAULT '',
  key_dates text DEFAULT '',
  last_stage_detected text DEFAULT '',
  last_analyzed_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.prospection_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view prospection context"
ON public.prospection_context
FOR SELECT
TO authenticated
USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Members can insert prospection context"
ON public.prospection_context
FOR INSERT
TO authenticated
WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Members can update prospection context"
ON public.prospection_context
FOR UPDATE
TO authenticated
USING (is_org_member(auth.uid(), org_id));

CREATE TRIGGER update_prospection_context_updated_at
BEFORE UPDATE ON public.prospection_context
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
