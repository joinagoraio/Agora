-- Fix spaces table RLS policies to allow proper deletion
-- This script ensures space owners can delete their spaces

BEGIN;

-- 1. Check current state
DO $$
BEGIN
  RAISE NOTICE '================================';
  RAISE NOTICE 'FIXING SPACES DELETION RLS';
  RAISE NOTICE '================================';
  RAISE NOTICE '';
END $$;

-- 2. Ensure RLS is enabled on spaces
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing space policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their spaces" ON spaces;
DROP POLICY IF EXISTS "Users can view spaces they are members of" ON spaces;
DROP POLICY IF EXISTS "Space owners can update their spaces" ON spaces;
DROP POLICY IF EXISTS "Owners and admins can update spaces" ON spaces;
DROP POLICY IF EXISTS "Authenticated users can create spaces" ON spaces;
DROP POLICY IF EXISTS "Users can create spaces" ON spaces;
DROP POLICY IF EXISTS "Space owners can delete their spaces" ON spaces;
DROP POLICY IF EXISTS "Owners can delete spaces" ON spaces;

-- 4. Create clean space policies

-- SELECT: Users can view spaces they own or are members of
CREATE POLICY "Users can view their spaces"
ON spaces
FOR SELECT
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM space_members
    WHERE space_members.space_id = spaces.id
    AND space_members.user_id = auth.uid()
  )
);

-- INSERT: Any authenticated user can create a space (they become the owner)
CREATE POLICY "Users can create spaces"
ON spaces
FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- UPDATE: Owners and admins can update spaces
CREATE POLICY "Owners and admins can update spaces"
ON spaces
FOR UPDATE
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM space_members
    WHERE space_members.space_id = spaces.id
    AND space_members.user_id = auth.uid()
    AND space_members.role IN ('owner', 'admin')
  )
);

-- DELETE: Only owners can delete spaces
CREATE POLICY "Owners can delete spaces"
ON spaces
FOR DELETE
USING (owner_id = auth.uid());

-- 5. Grant necessary permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON spaces TO authenticated;

-- 6. Verify the policies were created
DO $$
DECLARE
  policy_count INTEGER;
  policy_name TEXT;
BEGIN
  SELECT COUNT(*)
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename = 'spaces';
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Created % policies on spaces table', policy_count;
  RAISE NOTICE '';
  
  -- List the policies
  RAISE NOTICE '📋 Current policies on spaces:';
  FOR policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'spaces'
    ORDER BY policyname
  LOOP
    RAISE NOTICE '   - %', policy_name;
  END LOOP;
  RAISE NOTICE '';
END $$;

COMMIT;

-- 7. Display completion message
DO $$
BEGIN
  RAISE NOTICE '================================';
  RAISE NOTICE '✅ SPACES DELETION FIX COMPLETE';
  RAISE NOTICE '================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Space owners can now:';
  RAISE NOTICE '   - View their spaces';
  RAISE NOTICE '   - Create new spaces';
  RAISE NOTICE '   - Update their spaces';
  RAISE NOTICE '   - Delete their spaces';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Test with: SELECT * FROM spaces WHERE owner_id = auth.uid();';
  RAISE NOTICE '';
END $$;

