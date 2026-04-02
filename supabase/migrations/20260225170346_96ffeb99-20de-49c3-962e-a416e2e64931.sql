
-- Add image_url column to messages table
ALTER TABLE public.messages ADD COLUMN image_url TEXT DEFAULT NULL;

-- Create storage bucket for WhatsApp media
INSERT INTO storage.buckets (id, name, public) VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to whatsapp media
CREATE POLICY "Public read access for whatsapp media"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

-- Allow service role to upload (edge functions use service role)
CREATE POLICY "Service role can upload whatsapp media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can update whatsapp media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'whatsapp-media');
