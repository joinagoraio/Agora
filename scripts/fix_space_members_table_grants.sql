-- ============================================================================
-- Fix table-level GRANT permissions on space_members
-- ============================================================================
-- Problem: "permission denied for table space_members" when trying to DELETE
-- Solution: Grant necessary table-level permissions to authenticated role
-- ============================================================================

DO $$ 
BEGIN 
    RAISE NOTICE '🔍 Checking current grants on space_members table...';
END $$;

-- Show current table privileges
SELECT 
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' 
    AND table_name = 'space_members'
ORDER BY grantee, privilege_type;

DO $$ 
BEGIN 
    RAISE NOTICE '';
    RAISE NOTICE '🔐 Granting table-level permissions...';
END $$;

-- Grant full CRUD permissions to authenticated users
-- RLS policies will control row-level access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_members TO authenticated;

-- Grant SELECT to anon role (for invitation acceptance flow)
GRANT SELECT ON public.space_members TO anon;

DO $$ 
BEGIN 
    RAISE NOTICE '✅ Table grants updated successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '✅ authenticated role can now:';
    RAISE NOTICE '   - SELECT (view members)';
    RAISE NOTICE '   - INSERT (add members)';
    RAISE NOTICE '   - UPDATE (modify member roles)';
    RAISE NOTICE '   - DELETE (remove members) ← THIS WAS MISSING';
    RAISE NOTICE '';
    RAISE NOTICE '✅ anon role can:';
    RAISE NOTICE '   - SELECT (needed for invitation acceptance)';
END $$;

-- Verify the new grants
DO $$ 
BEGIN 
    RAISE NOTICE '';
    RAISE NOTICE '📋 Current table privileges:';
END $$;

SELECT 
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' 
    AND table_name = 'space_members'
ORDER BY grantee, privilege_type;

