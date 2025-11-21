# Workspace Collaboration RLS Fix

## Problem Summary

The application shows a persistent console error when viewing workspaces:

```
[workspace-comments] Failed to load comments: {}
```

This error occurs at `app/workspaces/[workspaceId]/page.tsx:298` when trying to load workspace comments.

## Root Cause

The RLS (Row Level Security) policies on `workspace_comments` and `workspace_notes` tables only check for **space membership**, but the application also supports **workspace-only members** - users who are invited directly to a workspace without being members of the parent space.

### Current Policy (Broken)
```sql
-- Only checks space membership
EXISTS (
  SELECT 1 FROM workspaces w
  WHERE w.id = workspace_comments.workspace_id
  AND is_space_member(w.space_id, auth.uid())
)
```

### Required Policy (Fixed)
```sql
-- Checks both space AND workspace membership
EXISTS (
  -- User is a space member
  SELECT 1 FROM workspaces w
  WHERE w.id = workspace_comments.workspace_id
  AND is_space_member(w.space_id, auth.uid())
)
OR EXISTS (
  -- User is a direct workspace member
  SELECT 1 FROM workspace_members wm
  WHERE wm.workspace_id = workspace_comments.workspace_id
  AND wm.user_id = auth.uid()
)
```

## Impact

### Without Fix
- ❌ Workspace comments fail to load (empty error object)
- ❌ Workspace notes may fail to load for workspace-only members
- ❌ Console pollution makes debugging harder
- ❌ Feature degradation for users invited directly to workspaces

### With Fix
- ✅ Comments load correctly for all users
- ✅ Notes load correctly for all users
- ✅ Clean console with no RLS errors
- ✅ Proper support for workspace-only invitations

## Solution

### Option 1: Quick Fix with Script (Easiest)

Run the automated fix script:

```bash
# Set your database connection string (find it in Supabase Dashboard → Project Settings → Database)
export DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"

# Run the fix script
./scripts/apply_workspace_rls_fix.sh
```

The script will:
- ✅ Validate your environment
- ✅ Show what will be fixed
- ✅ Ask for confirmation
- ✅ Apply the fix
- ✅ Show verification output

### Option 2: Manual SQL Fix

Run the comprehensive fix script that handles all 4 tables:

```bash
# Set your database connection string
export DATABASE_URL="your-database-url-here"

# Apply the fix
psql $DATABASE_URL -f scripts/fix_workspace_collaboration_rls.sql
```

### Option 3: Individual Table Fixes

If you prefer to fix specific tables only:

```bash
# Fix workspace_comments only
psql $DATABASE_URL -f scripts/fix_workspace_comments_rls_v2.sql

# Fix workspace_notes only
psql $DATABASE_URL -f scripts/fix_workspace_notes_rls_v2.sql
```

### Option 4: Using Supabase Dashboard

If you're using Supabase:

1. Go to your project dashboard
2. Navigate to "SQL Editor"
3. Create a new query
4. Copy the contents of `scripts/fix_workspace_collaboration_rls.sql`
5. Run the query

## Verification

After applying the fix, you should see output like:

```
================================================================
✅ WORKSPACE COLLABORATION RLS FIX COMPLETE
================================================================

📊 Policy Counts:
   - workspace_comments: 4 policies
   - workspace_notes: 4 policies
   - workspace_activity: 2 policies
   - workspace_items: 4 policies

🔧 What was fixed:
   - All 4 collaboration tables now support workspace-only members
   - Space members can still access as before
   - Users invited directly to workspaces now have proper access

📋 Tables Fixed:
   ✓ workspace_comments (4 policies)
   ✓ workspace_notes (4 policies)
   ✓ workspace_activity (2 policies)
   ✓ workspace_items (4 policies)
```

### Testing the Fix

1. **Refresh your browser** (hard refresh: Cmd+Shift+R or Ctrl+Shift+R)
2. **Navigate to a workspace page** in your application
3. **Check the browser console** - the error should be gone
4. **Test the Notes tab** - notes should load without errors
5. **Test the Evidence tab** - comments should load without errors
6. **Test with workspace-only members** - invite a user directly to a workspace (not the space) and verify they can see notes/comments

## Technical Details

### Tables Affected
- `workspace_comments` - Comments on workspace items
- `workspace_notes` - Notes within workspaces
- `workspace_activity` - Activity logs for workspaces
- `workspace_items` - Items and evidence within workspaces

### Policies Created

For **workspace_comments**, **workspace_notes**, and **workspace_items** (4 policies each):

1. **SELECT Policy** - View access
   - Space members can view
   - Workspace-only members can view
   
2. **INSERT Policy** - Create access
   - Space members can create
   - Workspace-only members can create
   - Must be the author (`created_by = auth.uid()`)
   
3. **UPDATE Policy** - Edit access
   - Only the creator can update their own items
   
4. **DELETE Policy** - Delete access
   - Only the creator can delete their own items

For **workspace_activity** (2 policies):

1. **SELECT Policy** - View access
   - Space members can view
   - Workspace-only members can view
   
2. **INSERT Policy** - Create access
   - System can create (usually from triggers)

### Helper Functions

The fix ensures these helper functions exist:

```sql
-- Two-parameter version (explicit user)
is_space_member(space_id uuid, user_id uuid) → boolean

-- One-parameter version (uses current user)
is_space_member(space_id uuid) → boolean
```

## Membership Model

The application supports two types of workspace access:

### 1. Space Members → Workspace Access
- User is a member of the parent space
- Automatically has access to all workspaces in that space
- Checked via: `space_members.user_id = auth.uid()`

### 2. Workspace-Only Members
- User is invited directly to a workspace
- Does NOT have access to the parent space
- Does NOT have access to other workspaces in the space
- Checked via: `workspace_members.user_id = auth.uid()`

The RLS policies must check **both** scenarios using `OR` logic.

## Related Files

### Fixed Scripts
- ✅ `scripts/fix_workspace_collaboration_rls.sql` (comprehensive fix - ALL 4 tables)
- ✅ `scripts/apply_workspace_rls_fix.sh` (automated script to apply fix)
- ✅ `scripts/fix_workspace_comments_rls_v2.sql` (comments only)
- ✅ `scripts/fix_workspace_notes_rls_v2.sql` (notes only)

### Original Scripts (Incomplete)
- ❌ `scripts/fix_workspace_comments_rls.sql` (missing workspace members)
- ❌ `scripts/fix_workspace_notes_rls.sql` (missing workspace members)

### Application Code
- `app/workspaces/[workspaceId]/page.tsx` - Where the error occurs
- `lib/utils/workspace-access.ts` - Demonstrates both access patterns
- `scripts/030_workspace_memberships.sql` - Workspace members schema

## Prevention

To prevent similar issues in the future:

1. **Always consider both membership types** when writing RLS policies for workspace-related tables
2. **Use the pattern** demonstrated in this fix for any new workspace-scoped tables
3. **Test with workspace-only members** during development
4. **Document** which tables support workspace-only access

## FAQ

### Q: Will this affect existing users?
A: No, this only fixes access. Space members will continue to work as before, and workspace-only members will now work correctly.

### Q: Do I need to migrate data?
A: No, this only changes RLS policies. No data migration needed.

### Q: Can I roll back?
A: Yes, you can re-run the original scripts, but workspace-only members will lose access to comments/notes.

### Q: What if the error persists?
A: 
1. Verify the script ran successfully (check output)
2. Hard refresh your browser
3. Check `workspace_members` table exists and has data
4. Run diagnostic: `SELECT * FROM pg_policies WHERE tablename IN ('workspace_comments', 'workspace_notes')`

### Q: Are there other tables that need this fix?
A: The comprehensive fix already handles all known workspace collaboration tables:
- ✅ `workspace_comments` (fixed)
- ✅ `workspace_notes` (fixed)
- ✅ `workspace_activity` (fixed)
- ✅ `workspace_items` (fixed)

If you add new tables with `workspace_id` in the future, use the same pattern.

## Status

- ✅ Issue identified
- ✅ Fix scripts created
- ⏳ Awaiting application to database
- ⏳ Awaiting verification in UI

## Next Steps

1. **Apply the fix** using one of the options above
2. **Test thoroughly** with both user types
3. **Monitor console** for any remaining errors
4. **Consider auditing** other workspace-related tables for the same issue

