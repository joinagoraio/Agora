# Workspace Comments RLS Fix Guide

## Problem Summary

The application is failing to load workspace comments with an empty error object `{}`. This is due to Row Level Security (RLS) policy issues on the `workspace_comments` table.

### Root Cause

The `fix_workspace_creation_rls.sql` script updated the `workspace_comments` policies to use the two-parameter version of `is_space_member(space_id, user_id)`, but there was a mismatch in how the helper functions were defined across different migration scripts.

### Error Location

```
File: app/workspaces/[workspaceId]/page.tsx:256
Error: [workspace-comments] Failed to load comments: {}
```

The query at line 249-253 attempts to:
```typescript
const { data: commentsData, error: commentsError } = await supabase
  .from("workspace_comments")
  .select("id, workspace_id, workspace_item_id, content, created_at, created_by, author:profiles(id, full_name, email)")
  .eq("workspace_id", workspaceId)
  .order("created_at", { ascending: false })
```

## Solution

### Step 1: Diagnose Current State

First, check the current state of your database:

```bash
# Connect to your database
psql $DATABASE_URL -f scripts/diagnose_workspace_comments_rls.sql
```

This will show:
- Whether the `workspace_comments` table exists
- RLS status (enabled/disabled)
- Current policies
- Helper function status

### Step 2: Apply the Fix

Run the fix script to ensure both versions of `is_space_member` exist and policies are correctly defined:

```bash
psql $DATABASE_URL -f scripts/fix_workspace_comments_rls.sql
```

This script will:
1. Create/update both versions of `is_space_member`:
   - One-parameter: `is_space_member(p_space_id uuid)` - uses current user from auth.uid()
   - Two-parameter: `is_space_member(p_space_id uuid, p_user_id uuid)` - explicit user
2. Enable RLS with FORCE on `workspace_comments`
3. Drop and recreate all policies with correct function signatures
4. Add an UPDATE policy (which was missing)

### Step 3: Verify the Fix

After applying the fix:

1. **Check the script output** - it should show:
   ```
   ✅ WORKSPACE COMMENTS RLS FIX COMPLETE
   ✅ workspace_comments has 4 RLS policies
   ```

2. **Test in the application**:
   - Navigate to a workspace page
   - Check the browser console - the error should be gone
   - Try viewing the "Evidence" tab where comments appear

3. **Verify in database** (optional):
   ```sql
   SELECT policyname, cmd 
   FROM pg_policies 
   WHERE tablename = 'workspace_comments';
   ```
   
   Should return 4 policies:
   - `Users can view workspace_comments` (SELECT)
   - `Users can create workspace_comments` (INSERT)
   - `Users can update their workspace_comments` (UPDATE)
   - `Users can delete their workspace_comments` (DELETE)

## Technical Details

### Policy Logic

All policies follow the same pattern as `workspace_notes`:

**SELECT & INSERT**: User must be a member of the space that contains the workspace
```sql
EXISTS (
  SELECT 1 FROM workspaces w
  WHERE w.id = workspace_comments.workspace_id
  AND is_space_member(w.space_id, auth.uid())
)
```

**UPDATE & DELETE**: User must be the comment author
```sql
created_by = auth.uid()
```

### Helper Function Signatures

The fix ensures both versions exist:

```sql
-- Two-parameter (base)
CREATE OR REPLACE FUNCTION is_space_member(p_space_id uuid, p_user_id uuid)
RETURNS boolean ...

-- One-parameter (convenience wrapper)
CREATE OR REPLACE FUNCTION is_space_member(p_space_id uuid)
RETURNS boolean ...
```

## Related Issues

This same pattern was used to fix similar issues with:
- `workspace_notes` (fixed in `fix_workspace_notes_rls.sql`)
- `workspaces` (fixed in `fix_workspace_creation_rls.sql`)
- `spaces` (fixed in `fix_spaces_deletion_rls.sql`)

## Prevention

To prevent similar issues in the future:

1. Always use the two-parameter version of helper functions in policies for explicitness
2. Ensure both signatures exist for backward compatibility
3. Use `FORCE ROW LEVEL SECURITY` to ensure policies apply even to table owners
4. Test RLS policies with diagnostic scripts before deploying

## Files Modified

- ✅ Created: `scripts/fix_workspace_comments_rls.sql`
- ✅ Created: `scripts/diagnose_workspace_comments_rls.sql`
- ✅ Created: `WORKSPACE_COMMENTS_RLS_FIX_GUIDE.md`

## Next Steps

After applying this fix, you may want to:

1. Run the diagnostic script on other collaboration tables:
   - `workspace_activity` 
   - Any other tables that use `is_space_member`

2. Consider creating a unified RLS helper function script that ensures consistency across all tables

3. Update your migration/deployment process to include these diagnostic checks

