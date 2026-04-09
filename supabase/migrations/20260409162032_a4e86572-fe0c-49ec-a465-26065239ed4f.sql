CREATE TABLE public.agent_batch_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL,
  batch_number INTEGER NOT NULL DEFAULT 1,
  group_name TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'sem_acao',
  message_sent TEXT,
  stage_before TEXT,
  stage_after TEXT,
  reasoning TEXT,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_batch_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view batch reports"
ON public.agent_batch_reports
FOR SELECT
TO authenticated
USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Members can insert batch reports"
ON public.agent_batch_reports
FOR INSERT
TO authenticated
WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE INDEX idx_agent_batch_reports_execution ON public.agent_batch_reports(execution_id);
CREATE INDEX idx_agent_batch_reports_org ON public.agent_batch_reports(org_id, created_at DESC);