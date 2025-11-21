-- Fix workspace_notes RLS policies
-- This script ensures proper RLS policies are in place for workspace_notes

BEGIN;

-- 1. Ensure is_space_member function exists with correct signature
CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id uuid)
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
    AND user_id = auth.uid()
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid) TO service_role;

-- 2. Also create the two-parameter version used in some policies
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

GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO service_role;

-- 3. Ensure workspace_notes table has RLS enabled
ALTER TABLE public.workspace_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_notes FORCE ROW LEVEL SECURITY;

-- 4. Drop existing policies
DROP POLICY IF EXISTS "Users can view workspace_notes" ON public.workspace_notes;
DROP POLICY IF EXISTS "Users can create workspace_notes" ON public.workspace_notes;
DROP POLICY IF EXISTS "Users can update their workspace_notes" ON public.workspace_notes;
DROP POLICY IF EXISTS "Users can delete their workspace_notes" ON public.workspace_notes;

-- 5. Create new, working policies

-- SELECT: Users can view notes in workspaces within spaces they're members of
CREATE POLICY "Users can view workspace_notes"
ON public.workspace_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_notes.workspace_id
    AND is_space_member(w.space_id, auth.uid())
  )
);

-- INSERT: Users can create notes in workspaces within spaces they're members of
CREATE POLICY "Users can create workspace_notes"
ON public.workspace_notes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_notes.workspace_id
    AND is_space_member(w.space_id, auth.uid())
  )
  AND created_by = auth.uid()
);

-- UPDATE: Users can only update their own notes
CREATE POLICY "Users can update their workspace_notes"
ON public.workspace_notes
FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- DELETE: Users can only delete their own notes
CREATE POLICY "Users can delete their workspace_notes"
ON public.workspace_notes
FOR DELETE
USING (created_by = auth.uid());

-- 6. Grant necessary permissions on the table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_notes TO authenticated;
GRANT ALL ON public.workspace_notes TO service_role;

-- 7. Ensure the table has the include_in_ai_context column
ALTER TABLE public.workspace_notes
  ADD COLUMN IF NOT EXISTS include_in_ai_context boolean NOT NULL DEFAULT true;

COMMIT;

-- 8. Verify the setup
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'workspace_notes';
  
  RAISE NOTICE '✅ workspace_notes now has % RLS policies', policy_count;
  
  IF policy_count >= 4 THEN
    RAISE NOTICE '✅ All required policies are in place';
  ELSE
    RAISE WARNING '⚠️  Expected 4 policies, found %', policy_count;
  END IF;
END $$;

