-- Grant table-level permissions on invitations
-- This might be the missing piece

BEGIN;

-- Ensure authenticated users have INSERT permission on the table itself
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Also grant to anon (for public invitation acceptance)
GRANT SELECT, UPDATE ON public.invitations TO anon;

-- Verify grants
DO $$
DECLARE
  grant_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO grant_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'invitations'
    AND grantee = 'authenticated'
    AND privilege_type = 'INSERT';
  
  IF grant_count = 0 THEN
    RAISE EXCEPTION 'INSERT grant to authenticated was not applied!';
  END IF;
  
  RAISE NOTICE '✓ Table-level permissions granted';
  RAISE NOTICE '✓ authenticated role can INSERT into invitations';
END;
$$;

COMMIT;

-- Show final grants
SELECT 
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) as privileges
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'invitations'
GROUP BY grantee
ORDER BY grantee;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TABLE GRANTS APPLIED ===';
  RAISE NOTICE 'Test inviting again from your app!';
  RAISE NOTICE '';
  RAISE NOTICE 'If still failing, the issue is with is_space_admin() function';
END;
$$;

