-- Fix: Grant table-level permissions on conversations table
-- This is needed for authenticated users to insert/query conversations

BEGIN;

-- Step 1: Grant full permissions to authenticated users on conversations table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;

-- Step 2: Grant schema usage (just in case)
GRANT USAGE ON SCHEMA public TO authenticated;

-- Step 3: Grant permissions on related tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- Step 4: Add missing columns if they don't exist
DO $$
BEGIN
  -- Add context_type column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'conversations' 
    AND column_name = 'context_type'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN context_type text DEFAULT 'workspace';
    RAISE NOTICE '✓ Added context_type column';
  END IF;

  -- Add context_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'conversations' 
    AND column_name = 'context_id'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN context_id uuid;
    RAISE NOTICE '✓ Added context_id column';
  END IF;
END $$;

-- Step 5: Update any NULL context_type values
UPDATE public.conversations 
SET context_type = 'workspace' 
WHERE context_type IS NULL;

-- Step 6: Set defaults and constraints
ALTER TABLE public.conversations 
  ALTER COLUMN context_type SET DEFAULT 'workspace';

-- Only set NOT NULL if all values are populated
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE context_type IS NULL) THEN
    ALTER TABLE public.conversations ALTER COLUMN context_type SET NOT NULL;
    RAISE NOTICE '✓ Set context_type to NOT NULL';
  END IF;
END $$;

-- Step 7: Create index for performance
CREATE INDEX IF NOT EXISTS conversations_workspace_context_idx
  ON public.conversations (workspace_id, context_type, context_id);

-- Step 8: Grant execute on helper functions (needed for RLS policies)
DO $$
DECLARE
  func_count INTEGER;
BEGIN
  -- Grant execute on is_workspace_member if it exists
  SELECT COUNT(*) INTO func_count
  FROM pg_proc 
  WHERE proname = 'is_workspace_member' 
    AND pronamespace = 'public'::regnamespace;
  
  IF func_count > 0 THEN
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated';
      RAISE NOTICE '✓ Granted execute on is_workspace_member(uuid)';
    EXCEPTION WHEN undefined_function THEN
      NULL; -- Function with this signature doesn't exist
    END;
    
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated';
      RAISE NOTICE '✓ Granted execute on is_workspace_member(uuid, uuid)';
    EXCEPTION WHEN undefined_function THEN
      NULL; -- Function with this signature doesn't exist
    END;
  ELSE
    RAISE NOTICE '⚠ is_workspace_member function not found';
  END IF;

  -- Grant execute on is_workspace_admin if it exists
  SELECT COUNT(*) INTO func_count
  FROM pg_proc 
  WHERE proname = 'is_workspace_admin' 
    AND pronamespace = 'public'::regnamespace;
  
  IF func_count > 0 THEN
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid) TO authenticated';
      RAISE NOTICE '✓ Granted execute on is_workspace_admin(uuid)';
    EXCEPTION WHEN undefined_function THEN
      NULL; -- Function with this signature doesn't exist
    END;
    
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO authenticated';
      RAISE NOTICE '✓ Granted execute on is_workspace_admin(uuid, uuid)';
    EXCEPTION WHEN undefined_function THEN
      NULL; -- Function with this signature doesn't exist
    END;
  ELSE
    RAISE NOTICE '⚠ is_workspace_admin function not found';
  END IF;
END $$;

-- Step 9: Verify grants were applied
DO $$
DECLARE
  grant_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO grant_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'conversations'
    AND grantee = 'authenticated'
    AND privilege_type = 'INSERT';
  
  IF grant_count = 0 THEN
    RAISE EXCEPTION 'INSERT grant to authenticated was not applied!';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '✓ Table-level permissions granted successfully';
  RAISE NOTICE '✓ authenticated role can INSERT into conversations';
  RAISE NOTICE '';
END $$;

COMMIT;

-- Step 10: Show current grants on conversations table
SELECT 
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) as privileges
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'conversations'
  AND grantee IN ('authenticated', 'anon', 'service_role')
GROUP BY grantee
ORDER BY grantee;

-- Step 11: Verify column structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'conversations'
ORDER BY ordinal_position;

-- Final message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '====================================';
  RAISE NOTICE '✅ CONVERSATIONS TABLE FIX COMPLETE';
  RAISE NOTICE '====================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Table permissions granted';
  RAISE NOTICE '✅ Missing columns added';
  RAISE NOTICE '✅ Indexes created';
  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test: Try creating a new chat in your app';
  RAISE NOTICE '';
END $$;

