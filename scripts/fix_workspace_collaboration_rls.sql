-- Comprehensive fix for workspace collaboration RLS policies
-- This script fixes ALL workspace collaboration tables to handle:
-- 1. Space members (users who are members of the workspace's parent space)
-- 2. Workspace-only members (users invited directly to workspace without space access)
--
-- Tables fixed:
-- - workspace_notes
-- - workspace_comments
-- - workspace_activity
-- - workspace_items
--
-- Run this script to fix the console error:
-- [workspace-comments] Failed to load comments: {}

BEGIN;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO service_role;

-- =============================================================================
-- WORKSPACE COMMENTS
-- =============================================================================

-- Enable RLS
ALTER TABLE public.workspace_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_comments FORCE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view workspace_comments" ON public.workspace_comments;
DROP POLICY IF EXISTS "Users can create workspace_comments" ON public.workspace_comments;
DROP POLICY IF EXISTS "Users can update their workspace_comments" ON public.workspace_comments;
DROP POLICY IF EXISTS "Users can delete their workspace_comments" ON public.workspace_comments;

-- SELECT: Users can view comments in workspaces they have access to
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

-- INSERT: Users can create comments in workspaces they have access to
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

-- UPDATE: Users can update their own comments
CREATE POLICY "Users can update their workspace_comments"
ON public.workspace_comments
FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- DELETE: Users can delete their own comments
CREATE POLICY "Users can delete their workspace_comments"
ON public.workspace_comments
FOR DELETE
USING (created_by = auth.uid());

-- =============================================================================
-- WORKSPACE NOTES
-- =============================================================================

-- Enable RLS
ALTER TABLE public.workspace_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_notes FORCE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view workspace_notes" ON public.workspace_notes;
DROP POLICY IF EXISTS "Users can create workspace_notes" ON public.workspace_notes;
DROP POLICY IF EXISTS "Users can update their workspace_notes" ON public.workspace_notes;
DROP POLICY IF EXISTS "Users can delete their workspace_notes" ON public.workspace_notes;

-- SELECT: Users can view notes in workspaces they have access to
CREATE POLICY "Users can view workspace_notes"
ON public.workspace_notes
FOR SELECT
USING (
  -- User is a space member of the workspace's parent space
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_notes.workspace_id
    AND public.is_space_member(w.space_id, auth.uid())
  )
  OR
  -- User is a direct workspace member (workspace-only access)
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_notes.workspace_id
    AND wm.user_id = auth.uid()
  )
);

-- INSERT: Users can create notes in workspaces they have access to
CREATE POLICY "Users can create workspace_notes"
ON public.workspace_notes
FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND (
    -- User is a space member
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_notes.workspace_id
      AND public.is_space_member(w.space_id, auth.uid())
    )
    OR
    -- User is a direct workspace member
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_notes.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
);

-- UPDATE: Users can update their own notes
CREATE POLICY "Users can update their workspace_notes"
ON public.workspace_notes
FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- DELETE: Users can delete their own notes
CREATE POLICY "Users can delete their workspace_notes"
ON public.workspace_notes
FOR DELETE
USING (created_by = auth.uid());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_notes TO authenticated;
GRANT ALL ON public.workspace_notes TO service_role;

-- Ensure the table has the include_in_ai_context column
ALTER TABLE public.workspace_notes
  ADD COLUMN IF NOT EXISTS include_in_ai_context boolean NOT NULL DEFAULT true;

-- =============================================================================
-- WORKSPACE ACTIVITY
-- =============================================================================

-- Enable RLS
ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_activity FORCE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view workspace_activity" ON public.workspace_activity;
DROP POLICY IF EXISTS "System can create workspace_activity" ON public.workspace_activity;

-- SELECT: Users can view activity in workspaces they have access to
CREATE POLICY "Users can view workspace_activity"
ON public.workspace_activity
FOR SELECT
USING (
  -- User is a space member of the workspace's parent space
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_activity.workspace_id
    AND public.is_space_member(w.space_id, auth.uid())
  )
  OR
  -- User is a direct workspace member (workspace-only access)
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_activity.workspace_id
    AND wm.user_id = auth.uid()
  )
);

-- INSERT: System can create activity (usually from triggers)
CREATE POLICY "System can create workspace_activity"
ON public.workspace_activity
FOR INSERT
WITH CHECK (true);

-- =============================================================================
-- WORKSPACE ITEMS
-- =============================================================================

-- Enable RLS
ALTER TABLE public.workspace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_items FORCE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view workspace_items" ON public.workspace_items;
DROP POLICY IF EXISTS "Users can create workspace_items" ON public.workspace_items;
DROP POLICY IF EXISTS "Users can update workspace_items" ON public.workspace_items;
DROP POLICY IF EXISTS "Users can delete workspace_items" ON public.workspace_items;

-- SELECT: Users can view items in workspaces they have access to
CREATE POLICY "Users can view workspace_items"
ON public.workspace_items
FOR SELECT
USING (
  -- User is a space member of the workspace's parent space
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_items.workspace_id
    AND public.is_space_member(w.space_id, auth.uid())
  )
  OR
  -- User is a direct workspace member (workspace-only access)
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_items.workspace_id
    AND wm.user_id = auth.uid()
  )
);

-- INSERT: Users can create items in workspaces they have access to
CREATE POLICY "Users can create workspace_items"
ON public.workspace_items
FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND (
    -- User is a space member
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_items.workspace_id
      AND public.is_space_member(w.space_id, auth.uid())
    )
    OR
    -- User is a direct workspace member
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_items.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
);

-- UPDATE: Users can update items they created
CREATE POLICY "Users can update workspace_items"
ON public.workspace_items
FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- DELETE: Users can delete items they created
CREATE POLICY "Users can delete workspace_items"
ON public.workspace_items
FOR DELETE
USING (created_by = auth.uid());

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  comments_policy_count integer;
  notes_policy_count integer;
  activity_policy_count integer;
  items_policy_count integer;
BEGIN
  -- Count policies for all tables
  SELECT COUNT(*) INTO comments_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename = 'workspace_comments';
  
  SELECT COUNT(*) INTO notes_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename = 'workspace_notes';
  
  SELECT COUNT(*) INTO activity_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename = 'workspace_activity';
  
  SELECT COUNT(*) INTO items_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename = 'workspace_items';
  
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '✅ WORKSPACE COLLABORATION RLS FIX COMPLETE';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Policy Counts:';
  RAISE NOTICE '   - workspace_comments: % policies', comments_policy_count;
  RAISE NOTICE '   - workspace_notes: % policies', notes_policy_count;
  RAISE NOTICE '   - workspace_activity: % policies', activity_policy_count;
  RAISE NOTICE '   - workspace_items: % policies', items_policy_count;
  RAISE NOTICE '';
  RAISE NOTICE '🔧 What was fixed:';
  RAISE NOTICE '   - All 4 collaboration tables now support workspace-only members';
  RAISE NOTICE '   - Space members can still access as before';
  RAISE NOTICE '   - Users invited directly to workspaces now have proper access';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Tables Fixed:';
  RAISE NOTICE '   ✓ workspace_comments (4 policies)';
  RAISE NOTICE '   ✓ workspace_notes (4 policies)';
  RAISE NOTICE '   ✓ workspace_activity (2 policies)';
  RAISE NOTICE '   ✓ workspace_items (4 policies)';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Next Steps:';
  RAISE NOTICE '   1. Refresh your application (hard refresh in browser)';
  RAISE NOTICE '   2. Navigate to a workspace page';
  RAISE NOTICE '   3. Check console - the "[workspace-comments] Failed to load" error should be gone';
  RAISE NOTICE '   4. Test Notes tab - notes should load without errors';
  RAISE NOTICE '   5. Test Evidence tab - comments and items should load without errors';
  RAISE NOTICE '   6. Test with workspace-only members if applicable';
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
END $$;

