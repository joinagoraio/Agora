-- Fix workspace_comments RLS policies (v2)
-- This script ensures workspace_comments has proper RLS policies that handle:
-- 1. Space members (users who are members of the workspace's parent space)
-- 2. Workspace-only members (users invited directly to workspace without space access)

BEGIN;

-- 1. Ensure helper functions exist with both signatures
-- Two-parameter version (base function)
CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_members
    WHERE space_id = p_space_id
    AND user_id = p_user_id
  );
$$;

-- One-parameter version (convenience wrapper)
CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.is_space_member(p_space_id, auth.uid());
$$;

-- 2. Enable RLS on workspace_comments
ALTER TABLE public.workspace_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_comments FORCE ROW LEVEL SECURITY;

-- 3. Drop existing policies
DROP POLICY IF EXISTS "Users can view workspace_comments" ON public.workspace_comments;
DROP POLICY IF EXISTS "Users can create workspace_comments" ON public.workspace_comments;
DROP POLICY IF EXISTS "Users can update their workspace_comments" ON public.workspace_comments;
DROP POLICY IF EXISTS "Users can delete their workspace_comments" ON public.workspace_comments;

-- 4. Create SELECT policy - users can view comments in workspaces they have access to
-- This includes both space members AND workspace-only members
CREATE POLICY "Users can view workspace_comments"
ON public.workspace_comments
FOR SELECT
USING (
  -- User is a space member of the workspace's parent space
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_comments.workspace_id
    AND public.is_space_member(w.space_id, auth.uid())
  )
  OR
  -- User is a direct workspace member (workspace-only access)
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_comments.workspace_id
    AND wm.user_id = auth.uid()
  )
);

-- 5. Create INSERT policy - users can create comments in workspaces they have access to
CREATE POLICY "Users can create workspace_comments"
ON public.workspace_comments
FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND (
    -- User is a space member
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_comments.workspace_id
      AND public.is_space_member(w.space_id, auth.uid())
    )
    OR
    -- User is a direct workspace member
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_comments.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
);

-- 6. Create UPDATE policy - users can update their own comments
CREATE POLICY "Users can update their workspace_comments"
ON public.workspace_comments
FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- 7. Create DELETE policy - users can delete their own comments
CREATE POLICY "Users can delete their workspace_comments"
ON public.workspace_comments
FOR DELETE
USING (created_by = auth.uid());

COMMIT;

-- Verification queries
DO $$
DECLARE
  policy_count integer;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================';
  RAISE NOTICE '✅ WORKSPACE COMMENTS RLS FIX V2 COMPLETE';
  RAISE NOTICE '================================';
  RAISE NOTICE '';
  
  -- Count policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename = 'workspace_comments';
  
  RAISE NOTICE '✅ workspace_comments has % RLS policies', policy_count;
  RAISE NOTICE '';
  RAISE NOTICE '📋 Policy Summary:';
  RAISE NOTICE '   - SELECT: Users can view comments in workspaces they access (space OR workspace members)';
  RAISE NOTICE '   - INSERT: Users can create comments in workspaces they access (space OR workspace members)';
  RAISE NOTICE '   - UPDATE: Users can update their own comments';
  RAISE NOTICE '   - DELETE: Users can delete their own comments';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Key Improvements:';
  RAISE NOTICE '   - Now supports workspace-only members (direct workspace invites)';
  RAISE NOTICE '   - Maintains support for space members';
  RAISE NOTICE '   - Handles both membership types with OR logic';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Next steps:';
  RAISE NOTICE '   1. Test loading workspace comments in the UI';
  RAISE NOTICE '   2. Test with both space members and workspace-only members';
  RAISE NOTICE '   3. Verify no RLS errors appear in console';
  RAISE NOTICE '';
END $$;


