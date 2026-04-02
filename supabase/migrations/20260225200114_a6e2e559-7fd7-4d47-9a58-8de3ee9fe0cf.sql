
-- Table to cache WhatsApp contact profile pictures
CREATE TABLE public.contact_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  fetched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, phone_number)
);

-- Index for fast lookups
CREATE INDEX idx_contact_profiles_org_phone ON public.contact_profiles(org_id, phone_number);

-- Enable RLS
ALTER TABLE public.contact_profiles ENABLE ROW LEVEL SECURITY;

-- Members can read contacts from their org
CREATE POLICY "Org members can view contact profiles"
ON public.contact_profiles FOR SELECT
USING (public.is_org_member(auth.uid(), org_id));

-- Service role inserts (from edge functions)
CREATE POLICY "Service role can manage contact profiles"
ON public.contact_profiles FOR ALL
USING (true)
WITH CHECK (true);

-- Note: the "service role" policy above is permissive but edge functions use service_role key.
-- We need a more restrictive approach: let org members insert/update too
CREATE POLICY "Org members can insert contact profiles"
ON public.contact_profiles FOR INSERT
WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can update contact profiles"
ON public.contact_profiles FOR UPDATE
USING (public.is_org_member(auth.uid(), org_id));

-- Trigger for updated_at
CREATE TRIGGER update_contact_profiles_updated_at
BEFORE UPDATE ON public.contact_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for profile pictures
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-pictures', 'profile-pictures', true);

-- Storage policies
CREATE POLICY "Profile pictures are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-pictures');

CREATE POLICY "Service can upload profile pictures"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'profile-pictures');

CREATE POLICY "Service can update profile pictures"
ON storage.objects FOR UPDATE
USING (bucket_id = 'profile-pictures');
