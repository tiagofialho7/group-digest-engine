
-- Table to store Resend email configuration per org
CREATE TABLE public.resend_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

-- Enable RLS
ALTER TABLE public.resend_configs ENABLE ROW LEVEL SECURITY;

-- Only admins can manage
CREATE POLICY "Admins can view resend config"
  ON public.resend_configs FOR SELECT
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins can insert resend config"
  ON public.resend_configs FOR INSERT
  WITH CHECK (has_org_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins can update resend config"
  ON public.resend_configs FOR UPDATE
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins can delete resend config"
  ON public.resend_configs FOR DELETE
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role));
