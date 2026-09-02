-- Authority-scoped conversations (Ask over the shared library without a programme).

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.conversations
  ALTER COLUMN workspace_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_scope_check'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_scope_check
      CHECK (
        (workspace_id IS NOT NULL AND space_id IS NULL)
        OR (workspace_id IS NULL AND space_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_space_user
  ON public.conversations(space_id, user_id)
  WHERE space_id IS NOT NULL;

DROP POLICY IF EXISTS "Space members can view space conversations" ON public.conversations;
CREATE POLICY "Space members can view space conversations"
  ON public.conversations FOR SELECT
  USING (
    space_id IS NOT NULL
    AND is_space_member(space_id, auth.uid())
  );

DROP POLICY IF EXISTS "Space members can create space conversations" ON public.conversations;
CREATE POLICY "Space members can create space conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    space_id IS NOT NULL
    AND workspace_id IS NULL
    AND user_id = auth.uid()
    AND is_space_member(space_id, auth.uid())
  );

DROP POLICY IF EXISTS "Space members can update space conversations" ON public.conversations;
CREATE POLICY "Space members can update space conversations"
  ON public.conversations FOR UPDATE
  USING (
    space_id IS NOT NULL
    AND user_id = auth.uid()
    AND is_space_member(space_id, auth.uid())
  )
  WITH CHECK (
    space_id IS NOT NULL
    AND user_id = auth.uid()
    AND is_space_member(space_id, auth.uid())
  );

DROP POLICY IF EXISTS "Space members can delete space conversations" ON public.conversations;
CREATE POLICY "Space members can delete space conversations"
  ON public.conversations FOR DELETE
  USING (
    space_id IS NOT NULL
    AND user_id = auth.uid()
    AND is_space_member(space_id, auth.uid())
  );

DROP POLICY IF EXISTS "Space members can view space conversation messages" ON public.messages;
CREATE POLICY "Space members can view space conversation messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.space_id IS NOT NULL
        AND is_space_member(c.space_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create messages in space conversations" ON public.messages;
CREATE POLICY "Users can create messages in space conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = auth.uid()
        AND c.space_id IS NOT NULL
        AND is_space_member(c.space_id, auth.uid())
    )
  );
