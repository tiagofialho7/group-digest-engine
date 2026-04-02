
CREATE TABLE public.evolution_api_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  tested_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.evolution_api_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view evolution config"
  ON public.evolution_api_configs FOR SELECT
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can insert evolution config"
  ON public.evolution_api_configs FOR INSERT
  WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin'::public.app_role));

CREATE POLICY "Admins can update evolution config"
  ON public.evolution_api_configs FOR UPDATE
  USING (public.has_org_role(auth.uid(), org_id, 'admin'::public.app_role));

CREATE POLICY "Admins can delete evolution config"
  ON public.evolution_api_configs FOR DELETE
  USING (public.has_org_role(auth.uid(), org_id, 'admin'::public.app_role));

CREATE TRIGGER update_evolution_api_configs_updated_at
  BEFORE UPDATE ON public.evolution_api_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX idx_unique_master_instance ON public.whatsapp_instances (org_id)
  WHERE instance_type = 'master' AND is_active = true;

CREATE UNIQUE INDEX idx_unique_user_instance ON public.whatsapp_instances (org_id, user_id)
  WHERE instance_type = 'user' AND is_active = true;
