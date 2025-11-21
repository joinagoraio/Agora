-- Grant necessary permissions to anon and authenticated roles
-- This is needed for the Next.js app to work properly

BEGIN;

-- Grant EXECUTE on helper functions to both authenticated and anon
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO authenticated, anon;

-- Grant SELECT on tables to authenticated (anon gets it via RLS when authenticated)
GRANT SELECT ON public.workspace_comments TO authenticated, anon;
GRANT SELECT ON public.workspace_notes TO authenticated, anon;
GRANT SELECT ON public.workspace_activity TO authenticated, anon;
GRANT SELECT ON public.workspace_items TO authenticated, anon;
GRANT SELECT ON public.profiles TO authenticated, anon;
GRANT SELECT ON public.workspaces TO authenticated, anon;
GRANT SELECT ON public.workspace_members TO authenticated, anon;
GRANT SELECT ON public.space_members TO authenticated, anon;

-- Grant INSERT/UPDATE/DELETE on workspace tables
GRANT INSERT, UPDATE, DELETE ON public.workspace_comments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.workspace_notes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.workspace_items TO authenticated;

COMMIT;

-- Verify grants
SELECT 
  'Granted permissions' as status,
  grantee,
  privilege_type,
  table_name
FROM information_schema.table_privileges
WHERE table_schema = 'public'
AND table_name IN ('workspace_comments', 'workspace_notes', 'profiles')
AND grantee IN ('authenticated', 'anon')
ORDER BY table_name, grantee, privilege_type;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Granted all necessary permissions';
  RAISE NOTICE '';
  RAISE NOTICE 'Roles can now:';
  RAISE NOTICE '  - Execute is_space_member function';
  RAISE NOTICE '  - SELECT from workspace tables';
  RAISE NOTICE '  - SELECT from profiles (for joins)';
  RAISE NOTICE '';
END;
$$;

