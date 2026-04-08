
CREATE TABLE public.agent_schedule_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  monday BOOLEAN NOT NULL DEFAULT true,
  tuesday BOOLEAN NOT NULL DEFAULT true,
  wednesday BOOLEAN NOT NULL DEFAULT true,
  thursday BOOLEAN NOT NULL DEFAULT true,
  friday BOOLEAN NOT NULL DEFAULT true,
  saturday BOOLEAN NOT NULL DEFAULT false,
  sunday BOOLEAN NOT NULL DEFAULT false,
  check_time_1 TIME NOT NULL DEFAULT '08:00',
  check_time_2 TIME NOT NULL DEFAULT '12:00',
  check_time_3 TIME NOT NULL DEFAULT '15:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

CREATE TABLE public.agent_message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  template_text TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, template_key)
);

ALTER TABLE public.agent_schedule_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view schedule config" ON public.agent_schedule_config FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage schedule config" ON public.agent_schedule_config FOR ALL USING (has_org_role(auth.uid(), org_id, 'admin')) WITH CHECK (has_org_role(auth.uid(), org_id, 'admin'));

CREATE POLICY "Members can view message templates" ON public.agent_message_templates FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage message templates" ON public.agent_message_templates FOR ALL USING (has_org_role(auth.uid(), org_id, 'admin')) WITH CHECK (has_org_role(auth.uid(), org_id, 'admin'));
