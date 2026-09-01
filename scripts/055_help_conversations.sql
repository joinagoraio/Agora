-- Guidance model S3: product Help AI conversations, isolated from policy chat.

CREATE TABLE IF NOT EXISTS public.help_conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.help_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES public.help_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  refused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_help_conversations_user ON public.help_conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_messages_conversation ON public.help_messages(conversation_id, created_at);

ALTER TABLE public.help_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own help conversations" ON public.help_conversations;
CREATE POLICY "Users manage own help conversations"
  ON public.help_conversations FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own help messages" ON public.help_messages;
CREATE POLICY "Users read own help messages"
  ON public.help_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.help_conversations c
      WHERE c.id = help_messages.conversation_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert own help user messages" ON public.help_messages;
CREATE POLICY "Users insert own help user messages"
  ON public.help_messages FOR INSERT
  WITH CHECK (
    role = 'user'
    AND EXISTS (
      SELECT 1 FROM public.help_conversations c
      WHERE c.id = help_messages.conversation_id AND c.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_conversations TO authenticated;
GRANT SELECT, INSERT ON public.help_messages TO authenticated;
GRANT SELECT, INSERT ON public.help_messages TO service_role;
