
-- Prospection groups table
CREATE TABLE public.prospection_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  monitored_group_id UUID REFERENCES public.monitored_groups(id) ON DELETE SET NULL,
  whatsapp_group_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  current_stage TEXT NOT NULL DEFAULT 'pre_qualification',
  prospect_name TEXT,
  prospect_company TEXT,
  assigned_consultants TEXT[] DEFAULT '{}',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority TEXT NOT NULL DEFAULT 'normal',
  last_agent_check_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stage history
CREATE TABLE public.prospection_stage_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prospection_group_id UUID NOT NULL REFERENCES public.prospection_groups(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent messages log
CREATE TABLE public.agent_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prospection_group_id UUID NOT NULL REFERENCES public.prospection_groups(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'followup',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered BOOLEAN NOT NULL DEFAULT false,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pending followups
CREATE TABLE public.agent_pending_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prospection_group_id UUID NOT NULL REFERENCES public.prospection_groups(id) ON DELETE CASCADE,
  followup_type TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  message_template TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.prospection_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospection_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_pending_followups ENABLE ROW LEVEL SECURITY;

-- prospection_groups policies
CREATE POLICY "Members can view prospection groups" ON public.prospection_groups FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can insert prospection groups" ON public.prospection_groups FOR INSERT WITH CHECK (has_org_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can update prospection groups" ON public.prospection_groups FOR UPDATE USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can delete prospection groups" ON public.prospection_groups FOR DELETE USING (has_org_role(auth.uid(), org_id, 'admin'));

-- stage_history policies
CREATE POLICY "Members can view stage history" ON public.prospection_stage_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.prospection_groups pg WHERE pg.id = prospection_stage_history.prospection_group_id AND is_org_member(auth.uid(), pg.org_id))
);
CREATE POLICY "Members can insert stage history" ON public.prospection_stage_history FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.prospection_groups pg WHERE pg.id = prospection_stage_history.prospection_group_id AND is_org_member(auth.uid(), pg.org_id))
);

-- agent_messages policies
CREATE POLICY "Members can view agent messages" ON public.agent_messages FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Members can insert agent messages" ON public.agent_messages FOR INSERT WITH CHECK (is_org_member(auth.uid(), org_id));

-- agent_pending_followups policies
CREATE POLICY "Members can view pending followups" ON public.agent_pending_followups FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Members can manage pending followups" ON public.agent_pending_followups FOR ALL USING (is_org_member(auth.uid(), org_id)) WITH CHECK (is_org_member(auth.uid(), org_id));

-- Indexes
CREATE INDEX idx_prospection_groups_org_stage ON public.prospection_groups(org_id, current_stage);
CREATE INDEX idx_prospection_groups_active ON public.prospection_groups(org_id, is_active);
CREATE INDEX idx_agent_messages_group ON public.agent_messages(prospection_group_id);
CREATE INDEX idx_agent_pending_followups_status ON public.agent_pending_followups(status, scheduled_for);
