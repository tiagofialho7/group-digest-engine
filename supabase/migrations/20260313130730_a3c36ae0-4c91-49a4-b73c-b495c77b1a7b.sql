
-- Create system_settings table
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read system_settings (needed for Auth page check)
CREATE POLICY "Anyone can read system_settings"
ON public.system_settings
FOR SELECT
TO anon, authenticated
USING (true);

-- Any authenticated user can modify system_settings
CREATE POLICY "Authenticated can modify system_settings"
ON public.system_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Insert default row with registration enabled
INSERT INTO public.system_settings (registration_enabled) VALUES (true);
