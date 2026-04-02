
-- Allow users to delete their own chat messages
CREATE POLICY "Users can delete own chat messages"
ON public.chat_messages
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM chat_sessions cs
  WHERE cs.id = chat_messages.session_id AND cs.user_id = auth.uid()
));

-- Allow users to delete their own chat sessions
CREATE POLICY "Users can delete own chat sessions"
ON public.chat_sessions
FOR DELETE
USING (auth.uid() = user_id);
