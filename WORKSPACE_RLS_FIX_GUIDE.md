# Workspace RLS Errors - Complete Fix Guide

## Problems
You may be seeing one or more of these RLS errors:

1. **Workspace creation error:**
```
new row violates row-level security policy for table "workspaces"
```

2. **Workspace notes/comments loading errors:**
```
[workspace-notes] Failed to load notes: {}
[workspace-comments] Failed to load comments: {}
```

These are all related to the same underlying RLS configuration issues.

## Root Cause
These errors occur because the Row-Level Security (RLS) policies check if the user is a member of the parent space, but:

1. **Wrong function signature**: The helper function `is_space_member()` needs to exist in TWO versions:
   - One-parameter version: `is_space_member(space_id)` - used by workspace_notes/comments policies
   - Two-parameter version: `is_space_member(space_id, user_id)` - used by workspace policies
2. **Conflicting policies**: Multiple migration scripts may have created conflicting RLS policies
3. **Missing membership**: Users might not be properly added to `space_members` when creating a space

## Quick Fix

### Step 1: Run the Fix SQL Script

1. Open your Supabase Dashboard
2. Go to **SQL Editor**
3. Open and run the file: `scripts/fix_workspace_creation_rls.sql`

This script will:
- ✅ Clean up any conflicting helper functions
- ✅ Recreate `is_space_member()` in BOTH one-param and two-param versions
- ✅ Recreate `has_space_role()` with correct signature
- ✅ Drop and recreate all workspace RLS policies
- ✅ Fix workspace_notes and workspace_comments RLS policies
- ✅ Grant proper permissions to all functions

### Step 2: Verify the Fix

Run the diagnostic script to verify everything is working:

```bash
# Load environment variables
source .env.local  # or use your preferred method

# Run diagnostic
npx tsx scripts/diagnose-workspace-rls.ts
```

### Step 3: Test Workspace Creation

1. Try creating a new workspace in your app
2. If it still fails, check the diagnostic output

## Detailed Diagnosis

### Check 1: Verify Helper Functions

Connect to your database and run:

```sql
-- Check if functions exist
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('is_space_member', 'has_space_role')
ORDER BY p.proname;
```

Expected result (you should see BOTH versions):
- `is_space_member(p_space_id uuid) -> boolean` (one-param version)
- `is_space_member(p_space_id uuid, p_user_id uuid) -> boolean` (two-param version)
- `has_space_role(p_space_id uuid, p_user_id uuid, p_roles text[]) -> boolean`

### Check 2: Verify Space Membership

When you create a space, verify the user is added to `space_members`:

```sql
-- Check space members for your space
SELECT 
  s.name as space_name,
  sm.user_id,
  sm.role,
  p.email
FROM spaces s
LEFT JOIN space_members sm ON s.id = sm.space_id
LEFT JOIN profiles p ON sm.user_id = p.id
WHERE s.id = 'YOUR_SPACE_ID';
```

Expected result:
- The space owner should have a record in `space_members` with role='owner'

### Check 3: Verify RLS Policies

Check the current workspace policies:

```sql
SELECT 
  policyname,
  cmd as operation,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'workspaces';
```

Expected policies:
- `Space members can view workspaces` (SELECT)
- `Space members can create workspaces` (INSERT)
- `Space admins can update workspaces` (UPDATE)
- `Space admins can delete workspaces` (DELETE)

Also check workspace_notes and workspace_comments:
```sql
SELECT policyname, tablename
FROM pg_policies
WHERE tablename IN ('workspace_notes', 'workspace_comments');
```

Expected:
- `Users can view workspace_notes` (SELECT)
- `Users can create workspace_notes` (INSERT)
- `Users can update their workspace_notes` (UPDATE)
- `Users can delete their workspace_notes` (DELETE)
- Similar policies for workspace_comments

## Manual Fix (if script doesn't work)

If running the SQL script doesn't work, follow these manual steps:

### 1. Drop Conflicting Functions

```sql
-- Drop all versions of the functions
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT oid::regprocedure as func_name
    FROM pg_proc
    WHERE proname IN ('is_space_member', 'has_space_role')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_name || ' CASCADE';
  END LOOP;
END $$;
```

### 2. Create Correct Helper Functions

```sql
-- Create is_space_member (TWO VERSIONS REQUIRED!)

-- Two-parameter version
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
  
  -- Check if user is owner
  IF EXISTS (
    SELECT 1 FROM spaces 
    WHERE id = p_space_id AND owner_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is member
  IF EXISTS (
    SELECT 1 FROM space_members 
    WHERE space_id = p_space_id AND user_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- One-parameter version (defaults to current user)
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_space_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_space_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_space_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION is_space_member(uuid) TO service_role;
```

### 3. Recreate Workspace Policies

```sql
-- Drop old policies
DROP POLICY IF EXISTS "Space members can create workspaces" ON workspaces;

-- Create new policy
CREATE POLICY "Space members can create workspaces" 
ON workspaces
FOR INSERT
WITH CHECK (is_space_member(space_id, auth.uid()));
```

## Prevention

To prevent this issue in the future:

1. **Always use adminClient for creating memberships**: When creating spaces, use the admin client to insert the space_members record:

```typescript
// In lib/actions/space.ts
const adminClient = createAdminClient()
const { error: memberError } = await adminClient.from("space_members").insert({
  space_id: newSpace.id,
  user_id: user.id,
  role: "owner",
})
```

2. **Test RLS policies**: After any schema changes, test that users can perform expected operations

3. **Use consistent function signatures**: Ensure all helper functions use the same signature across all scripts

## Understanding Empty Error Objects

If you see errors like `Failed to load notes: {}`, this means:
- The RLS policy blocked the query
- Supabase returns an empty error object when RLS denies access
- This is NOT a code bug, but a permissions issue

To debug:
1. Go to Supabase Dashboard → SQL Editor
2. Run queries as the authenticated user (not service role)
3. Check the PostgreSQL logs for more detailed errors

## Still Having Issues?

If you're still experiencing issues after following this guide:

1. **Check Supabase logs**: Dashboard → Logs → PostgreSQL logs for detailed RLS errors
2. **Verify environment variables**: Ensure SUPABASE_URL and keys are correct
3. **Run the diagnostic**: `npm run diagnose:rls` to get detailed status
4. **Check RLS is enabled**:

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('workspaces', 'workspace_notes', 'workspace_comments');
```

All `rowsecurity` columns should be `true`.

5. **Verify function signatures exist**:
```sql
SELECT 
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args
FROM pg_proc p
WHERE p.proname = 'is_space_member';
```

You should see TWO rows (one with 1 arg, one with 2 args).

