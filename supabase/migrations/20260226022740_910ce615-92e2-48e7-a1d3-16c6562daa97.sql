
-- Add logo_url column to organizations
ALTER TABLE public.organizations ADD COLUMN logo_url text;

-- Create storage bucket for org logos
INSERT INTO storage.buckets (id, name, public) VALUES ('org-logos', 'org-logos', true);

-- Allow anyone to view org logos (public bucket)
CREATE POLICY "Org logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'org-logos');

-- Allow org admins to upload logos
CREATE POLICY "Admins can upload org logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'org-logos' AND EXISTS (
  SELECT 1 FROM org_members om
  WHERE om.user_id = auth.uid()
    AND om.role = 'admin'
    AND om.org_id::text = (storage.foldername(name))[1]
));

-- Allow org admins to update logos
CREATE POLICY "Admins can update org logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'org-logos' AND EXISTS (
  SELECT 1 FROM org_members om
  WHERE om.user_id = auth.uid()
    AND om.role = 'admin'
    AND om.org_id::text = (storage.foldername(name))[1]
));

-- Allow org admins to delete logos
CREATE POLICY "Admins can delete org logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'org-logos' AND EXISTS (
  SELECT 1 FROM org_members om
  WHERE om.user_id = auth.uid()
    AND om.role = 'admin'
    AND om.org_id::text = (storage.foldername(name))[1]
));
