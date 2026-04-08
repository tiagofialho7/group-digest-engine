CREATE TABLE public.agent_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  executed_at timestamptz NOT NULL DEFAULT now(),
  groups_checked integer NOT NULL DEFAULT 0,
  messages_sent integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error_log text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view execution logs"
  ON public.agent_execution_logs FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Members can insert execution logs"
  ON public.agent_execution_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE INDEX idx_agent_execution_logs_org ON public.agent_execution_logs(org_id, executed_at DESC);