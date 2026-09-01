-- Restore workspace INSERT RLS (missing after partial 030 apply) and allow
-- creators to seed their own workspace_members row.

BEGIN;

-- Space members / owners can create workspaces in their space
DROP POLICY IF EXISTS "Space members can create workspaces" ON public.workspaces;
CREATE POLICY "Space members can create workspaces"
  ON public.workspaces FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      is_space_member(space_id, auth.uid())
      OR EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND s.owner_id = auth.uid())
    )
  );

-- Also allow viewing workspaces you created (bootstrap before membership row exists)
DROP POLICY IF EXISTS "Creators can view own workspaces" ON public.workspaces;
CREATE POLICY "Creators can view own workspaces"
  ON public.workspaces FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Allow workspace creator to insert themselves as admin member
DROP POLICY IF EXISTS "Creators can join own workspace" ON public.workspace_members;
CREATE POLICY "Creators can join own workspace"
  ON public.workspace_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.created_by = auth.uid()
    )
  );

COMMIT;
