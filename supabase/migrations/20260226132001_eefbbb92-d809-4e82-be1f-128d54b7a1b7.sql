
-- Table to store AI-generated daily summaries per group
CREATE TABLE public.daily_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.monitored_groups(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, summary_date)
);

-- Enable RLS
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;

-- Members can view summaries of their org's groups
CREATE POLICY "Members can view daily summaries"
ON public.daily_summaries
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM monitored_groups mg
  WHERE mg.id = daily_summaries.group_id
  AND is_org_member(auth.uid(), mg.org_id)
));

-- Members can insert summaries for their org's groups
CREATE POLICY "Members can insert daily summaries"
ON public.daily_summaries
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM monitored_groups mg
    WHERE mg.id = daily_summaries.group_id
    AND is_org_member(auth.uid(), mg.org_id)
  )
);

-- Members can update summaries they created
CREATE POLICY "Members can update daily summaries"
ON public.daily_summaries
FOR UPDATE
USING (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM monitored_groups mg
    WHERE mg.id = daily_summaries.group_id
    AND is_org_member(auth.uid(), mg.org_id)
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_daily_summaries_updated_at
BEFORE UPDATE ON public.daily_summaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
