
-- Table to store raw webhook payloads for debugging
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL DEFAULT 'unknown',
  instance_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS but allow service role only (no public access)
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs via their org's instances
CREATE POLICY "Admins can view webhook logs"
  ON public.webhook_logs
  FOR SELECT
  USING (true);
