-- Programme Ask: workspace-scoped conversations must stay insertable for anyone
-- who can open the programme (member, creator, or authority admin).
-- Also stop treating a missing parent authority as "not a member".

CREATE OR REPLACE FUNCTION public.is_workspace_member(workspace_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  space_uuid UUID;
  creator_uuid UUID;
BEGIN
  IF workspace_uuid IS NULL OR user_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
      AND user_id = user_uuid
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT space_id, created_by INTO space_uuid, creator_uuid
  FROM workspaces
  WHERE id = workspace_uuid;

  IF creator_uuid = user_uuid THEN
    RETURN TRUE;
  END IF;

  IF space_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN is_space_admin(space_uuid, user_uuid);
END;
$$;

DROP POLICY IF EXISTS "Workspace access can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Workspace members can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Creators can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Creators and admins can delete conversations" ON public.conversations;

CREATE POLICY "Workspace access can view conversations"
  ON public.conversations FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND space_id IS NULL
    AND is_workspace_member(workspace_id, auth.uid())
  );

CREATE POLICY "Workspace members can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    workspace_id IS NOT NULL
    AND space_id IS NULL
    AND user_id = auth.uid()
    AND is_workspace_member(workspace_id, auth.uid())
  );

CREATE POLICY "Users can update their own conversations"
  ON public.conversations FOR UPDATE
  USING (
    workspace_id IS NOT NULL
    AND space_id IS NULL
    AND user_id = auth.uid()
    AND is_workspace_member(workspace_id, auth.uid())
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND space_id IS NULL
    AND user_id = auth.uid()
    AND is_workspace_member(workspace_id, auth.uid())
  );

CREATE POLICY "Creators and admins can delete conversations"
  ON public.conversations FOR DELETE
  USING (
    workspace_id IS NOT NULL
    AND space_id IS NULL
    AND (
      user_id = auth.uid()
      OR is_workspace_admin(workspace_id, auth.uid())
    )
  );
