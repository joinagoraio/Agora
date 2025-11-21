-- ============================================================================
-- Fix DELETE policy on space_members table
-- ============================================================================
-- Problem: Space admins cannot remove members (permission denied)
-- Solution: Add/update DELETE policy to allow space admins to remove members
-- ============================================================================

DO $$ 
BEGIN 
    RAISE NOTICE '🔍 Checking current DELETE policies on space_members...';
END $$;

-- Show current DELETE policies
SELECT 
    policyname,
    cmd,
    qual as using_clause
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename = 'space_members'
    AND cmd = 'DELETE';

DO $$ 
BEGIN 
    RAISE NOTICE '🗑️ Dropping old DELETE policies...';
END $$;

-- Drop any existing DELETE policies
DROP POLICY IF EXISTS "Space admins can remove members" ON space_members;
DROP POLICY IF EXISTS "Users can remove members" ON space_members;
DROP POLICY IF EXISTS "Admins can delete members" ON space_members;
DROP POLICY IF EXISTS "Space admins and users can delete their own membership" ON space_members;

DO $$ 
BEGIN 
    RAISE NOTICE '✅ Creating new DELETE policy...';
END $$;

-- Create comprehensive DELETE policy
-- Allows:
-- 1. Space admins to remove any member
-- 2. Users to remove themselves (leave the space)
CREATE POLICY "Space admins can remove members or users can leave"
    ON space_members
    FOR DELETE
    USING (
        -- Space admins can remove anyone
        is_space_admin(space_id, auth.uid())
        OR
        -- Users can remove themselves (leave the space)
        user_id = auth.uid()
    );

DO $$ 
BEGIN 
    RAISE NOTICE '🎉 DELETE policy updated successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Space admins can now:';
    RAISE NOTICE '   - Remove any member from the space';
    RAISE NOTICE '✅ Space members can:';
    RAISE NOTICE '   - Leave the space (remove themselves)';
END $$;

-- Verify the new policy
DO $$ 
BEGIN 
    RAISE NOTICE '';
    RAISE NOTICE '📋 Current DELETE policies:';
END $$;

SELECT 
    policyname,
    cmd,
    qual as policy_logic
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename = 'space_members'
    AND cmd = 'DELETE';

