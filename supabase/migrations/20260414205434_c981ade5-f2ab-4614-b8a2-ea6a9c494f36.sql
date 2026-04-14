ALTER TABLE public.prospection_groups
ADD COLUMN IF NOT EXISTS follow_up_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_follow_up_at timestamp with time zone;