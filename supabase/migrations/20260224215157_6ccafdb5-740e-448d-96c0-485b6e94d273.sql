
-- Table to store per-org API keys (e.g. Anthropic)
CREATE TABLE public.org_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'anthropic'
  api_key TEXT NOT NULL,
  is_valid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider)
);

ALTER TABLE public.org_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage org api keys"
  ON public.org_api_keys FOR ALL
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (has_org_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Members can view org api keys"
  ON public.org_api_keys FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

-- Add group_id to analysis_rules (nullable = org-wide rule)
ALTER TABLE public.analysis_rules 
  ADD COLUMN group_id UUID REFERENCES public.monitored_groups(id) ON DELETE CASCADE;
