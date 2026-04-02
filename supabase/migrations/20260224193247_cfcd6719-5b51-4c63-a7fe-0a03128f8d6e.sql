
-- Tabela principal de instâncias WhatsApp (multi-tenant via org_id)
CREATE TABLE public.whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID, -- null = instância da org (mãe), preenchido = instância pessoal
  name TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  instance_type TEXT NOT NULL DEFAULT 'master', -- 'master' ou 'user'
  provider_type TEXT NOT NULL DEFAULT 'evolution_self_hosted',
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected', -- connected, connecting, disconnected, qr_required
  qr_code TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de secrets separada (API keys nunca ficam na tabela principal)
CREATE TABLE public.whatsapp_instance_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE UNIQUE,
  api_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  verify_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS para whatsapp_instances
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org instances"
  ON public.whatsapp_instances FOR SELECT
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can insert master instances"
  ON public.whatsapp_instances FOR INSERT
  WITH CHECK (
    instance_type = 'master' AND public.has_org_role(auth.uid(), org_id, 'admin')
  );

CREATE POLICY "Users can insert own instances"
  ON public.whatsapp_instances FOR INSERT
  WITH CHECK (
    instance_type = 'user' AND auth.uid() = user_id AND public.is_org_member(auth.uid(), org_id)
  );

CREATE POLICY "Admins and owners can update instances"
  ON public.whatsapp_instances FOR UPDATE
  USING (
    (instance_type = 'master' AND public.has_org_role(auth.uid(), org_id, 'admin'))
    OR (instance_type = 'user' AND auth.uid() = user_id)
  );

CREATE POLICY "Admins and owners can delete instances"
  ON public.whatsapp_instances FOR DELETE
  USING (
    (instance_type = 'master' AND public.has_org_role(auth.uid(), org_id, 'admin'))
    OR (instance_type = 'user' AND auth.uid() = user_id)
  );

-- RLS para whatsapp_instance_secrets (acesso apenas via service role nas edge functions)
ALTER TABLE public.whatsapp_instance_secrets ENABLE ROW LEVEL SECURITY;

-- Membros da org podem ver secrets das instâncias da org (necessário para o frontend passar ao edge function)
CREATE POLICY "Members can view instance secrets"
  ON public.whatsapp_instance_secrets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_instances wi
      WHERE wi.id = whatsapp_instance_secrets.instance_id
      AND public.is_org_member(auth.uid(), wi.org_id)
    )
  );

-- Apenas admins podem inserir/atualizar secrets
CREATE POLICY "Admins can insert instance secrets"
  ON public.whatsapp_instance_secrets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_instances wi
      WHERE wi.id = whatsapp_instance_secrets.instance_id
      AND public.has_org_role(auth.uid(), wi.org_id, 'admin')
    )
  );

CREATE POLICY "Admins can update instance secrets"
  ON public.whatsapp_instance_secrets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_instances wi
      WHERE wi.id = whatsapp_instance_secrets.instance_id
      AND public.has_org_role(auth.uid(), wi.org_id, 'admin')
    )
  );

-- Trigger para updated_at
CREATE TRIGGER update_whatsapp_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_instance_secrets_updated_at
  BEFORE UPDATE ON public.whatsapp_instance_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
