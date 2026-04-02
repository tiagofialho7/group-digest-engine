-- Add reply threading columns to messages table
ALTER TABLE public.messages
ADD COLUMN reply_to_whatsapp_id TEXT,
ADD COLUMN quoted_content TEXT,
ADD COLUMN quoted_sender TEXT;

-- Index for fast lookup of reply chains
CREATE INDEX idx_messages_reply_to ON public.messages(reply_to_whatsapp_id) WHERE reply_to_whatsapp_id IS NOT NULL;
CREATE INDEX idx_messages_whatsapp_id ON public.messages(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;