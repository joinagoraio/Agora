-- Fix workspace creation RLS policy issue
-- This script diagnoses and fixes the workspace creation RLS violation

BEGIN;

-- 1. First, let's check and fix the helper functions
-- Drop all versions to ensure clean state
DO $$
DECLARE
  func_record RECORD;
BEGIN
  -- Drop all versions of is_space_member
  FOR func_record IN 
    SELECT oid::regprocedure as func_name
    FROM pg_proc
    WHERE proname = 'is_space_member'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_name || ' CASCADE';
  END LOOP;
  
  -- Drop all versions of has_space_role
  FOR func_record IN 
    SELECT oid::regprocedure as func_name
    FROM pg_proc
    WHERE proname = 'has_space_role'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_name || ' CASCADE';
  END LOOP;
END $$;

-- 2. Create the correct helper functions with SECURITY DEFINER
-- Create two-parameter version (for explicit user checks)
CREATE OR REPLACE FUNCTION is_space_member(p_space_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_space_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user is owner of the space
  IF EXISTS (
    SELECT 1 FROM spaces 
    WHERE id = p_space_id 
    AND owner_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is a member (bypass RLS with SECURITY DEFINER)
  IF EXISTS (
    SELECT 1 FROM space_members 
    WHERE space_id = p_space_id 
    AND user_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Create one-parameter version (defaults to current user)
CREATE OR REPLACE FUNCTION is_space_member(p_space_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN is_space_member(p_space_id, auth.uid());
END;
$$;

-- 3. Create has_space_role helper function
CREATE OR REPLACE FUNCTION has_space_role(p_space_id uuid, p_user_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is owner of the space (owners have all roles)
  IF EXISTS (
    SELECT 1 FROM spaces 
    WHERE id = p_space_id 
    AND owner_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has one of the required roles
  IF EXISTS (
    SELECT 1 FROM space_members 
    WHERE space_id = p_space_id 
    AND user_id = p_user_id 
    AND role = ANY(p_roles)
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- 4. Grant execute permissions
GRANT EXECUTE ON FUNCTION is_space_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_space_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_space_role(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION is_space_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION is_space_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION has_space_role(uuid, uuid, text[]) TO service_role;

-- 5. Drop existing workspace policies
DROP POLICY IF EXISTS "Space members can view workspaces" ON workspaces;
DROP POLICY IF EXISTS "Space members can create workspaces" ON workspaces;
DROP POLICY IF EXISTS "Admins can update workspaces" ON workspaces;
DROP POLICY IF EXISTS "Admins can delete workspaces" ON workspaces;
DROP POLICY IF EXISTS "Workspace access can view workspaces" ON workspaces;
DROP POLICY IF EXISTS "Workspace admins can update workspaces" ON workspaces;
DROP POLICY IF EXISTS "Workspace admins can delete workspaces" ON workspaces;

-- 6. Create clean workspace policies
CREATE POLICY "Space members can view workspaces" 
ON workspaces
FOR SELECT
USING (is_space_member(space_id, auth.uid()));

CREATE POLICY "Space members can create workspaces" 
ON workspaces
FOR INSERT
WITH CHECK (is_space_member(space_id, auth.uid()));

CREATE POLICY "Space admins can update workspaces" 
ON workspaces
FOR UPDATE
USING (has_space_role(space_id, auth.uid(), ARRAY['owner', 'admin']));

CREATE POLICY "Space admins can delete workspaces" 
ON workspaces
FOR DELETE
USING (has_space_role(space_id, auth.uid(), ARRAY['owner', 'admin']));

-- 7. Verify RLS is enabled on workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

-- 8. Fix workspace_notes and workspace_comments policies (if tables exist)
-- These tables also use is_space_member and may have issues
DO $$
BEGIN
  -- Check if workspace_notes table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'workspace_notes'
  ) THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE workspace_notes ENABLE ROW LEVEL SECURITY';
    
    -- Drop existing policies
    EXECUTE 'DROP POLICY IF EXISTS "Users can view workspace_notes" ON workspace_notes';
    EXECUTE 'DROP POLICY IF EXISTS "Users can create workspace_notes" ON workspace_notes';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update their workspace_notes" ON workspace_notes';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete their workspace_notes" ON workspace_notes';
    
    -- Recreate policies
    EXECUTE '
    CREATE POLICY "Users can view workspace_notes"
    ON workspace_notes
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE w.id = workspace_notes.workspace_id
        AND is_space_member(w.space_id, auth.uid())
      )
    )';
    
    EXECUTE '
    CREATE POLICY "Users can create workspace_notes"
    ON workspace_notes
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE w.id = workspace_notes.workspace_id
        AND is_space_member(w.space_id, auth.uid())
      )
    )';
    
    EXECUTE '
    CREATE POLICY "Users can update their workspace_notes"
    ON workspace_notes
    FOR UPDATE
    USING (created_by = auth.uid())';
    
    EXECUTE '
    CREATE POLICY "Users can delete their workspace_notes"
    ON workspace_notes
    FOR DELETE
    USING (created_by = auth.uid())';
    
    RAISE NOTICE '✅ Fixed workspace_notes policies';
  ELSE
    RAISE NOTICE 'ℹ️  workspace_notes table does not exist - skipping';
  END IF;

  -- Check if workspace_comments table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'workspace_comments'
  ) THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE workspace_comments ENABLE ROW LEVEL SECURITY';
    
    -- Drop existing policies
    EXECUTE 'DROP POLICY IF EXISTS "Users can view workspace_comments" ON workspace_comments';
    EXECUTE 'DROP POLICY IF EXISTS "Users can create workspace_comments" ON workspace_comments';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete their workspace_comments" ON workspace_comments';
    
    -- Recreate policies
    EXECUTE '
    CREATE POLICY "Users can view workspace_comments"
    ON workspace_comments
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE w.id = workspace_comments.workspace_id
        AND is_space_member(w.space_id, auth.uid())
      )
    )';
    
    EXECUTE '
    CREATE POLICY "Users can create workspace_comments"
    ON workspace_comments
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE w.id = workspace_comments.workspace_id
        AND is_space_member(w.space_id, auth.uid())
      )
    )';
    
    EXECUTE '
    CREATE POLICY "Users can delete their workspace_comments"
    ON workspace_comments
    FOR DELETE
    USING (created_by = auth.uid())';
    
    RAISE NOTICE '✅ Fixed workspace_comments policies';
  ELSE
    RAISE NOTICE 'ℹ️  workspace_comments table does not exist - skipping';
  END IF;
END $$;

COMMIT;

-- 9. Display diagnostic information
DO $$
DECLARE
  has_notes BOOLEAN;
  has_comments BOOLEAN;
BEGIN
  -- Check what tables exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'workspace_notes'
  ) INTO has_notes;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'workspace_comments'
  ) INTO has_comments;
  
  RAISE NOTICE '';
  RAISE NOTICE '================================';
  RAISE NOTICE '✅ WORKSPACE RLS FIX COMPLETE';
  RAISE NOTICE '================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Helper functions created:';
  RAISE NOTICE '   - is_space_member(uuid, uuid)';
  RAISE NOTICE '   - is_space_member(uuid)';
  RAISE NOTICE '   - has_space_role(uuid, uuid, text[])';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Workspace policies updated';
  
  IF has_notes THEN
    RAISE NOTICE '✅ workspace_notes policies updated';
  ELSE
    RAISE NOTICE 'ℹ️  workspace_notes table not found (may not be created yet)';
  END IF;
  
  IF has_comments THEN
    RAISE NOTICE '✅ workspace_comments policies updated';
  ELSE
    RAISE NOTICE 'ℹ️  workspace_comments table not found (may not be created yet)';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '📝 Next steps:';
  RAISE NOTICE '   1. Try creating a workspace';
  RAISE NOTICE '   2. Verify users are in space_members table';
  RAISE NOTICE '   3. Run: npm run diagnose:rls';
  RAISE NOTICE '';
END $$;

