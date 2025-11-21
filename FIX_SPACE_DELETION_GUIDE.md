# Fix Space Deletion: "Permission Denied" Error

## Error
```
failed to delete space: permission denied for table spaces
```

## Root Cause
The RLS (Row Level Security) policy for DELETE operations on the `spaces` table is either:
1. Missing entirely
2. Not properly configured
3. Missing the necessary GRANT permissions for the `authenticated` role

## Solution

Follow these steps to fix the issue:

### Step 1: Diagnose Current State

First, check the current RLS configuration:

**Option A: Via Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to: SQL Editor
3. Open and run: `scripts/diagnose_spaces_rls.sql`
4. Review the output to see what policies exist

**Option B: Via Supabase CLI** (if you have it installed)
```bash
supabase db execute --file scripts/diagnose_spaces_rls.sql
```

### Step 2: Apply the Fix

Run the fix script to recreate all space policies correctly:

**Option A: Via Supabase Dashboard** (Recommended)
1. Go to: SQL Editor in your Supabase dashboard
2. Create a new query
3. Copy the contents of `scripts/fix_spaces_deletion_rls.sql`
4. Paste and run it
5. Check the output messages for confirmation

**Option B: Via Supabase CLI**
```bash
supabase db execute --file scripts/fix_spaces_deletion_rls.sql
```

### Step 3: Verify the Fix

After applying the fix, verify it works:

1. **Check policies were created:**
   ```sql
   SELECT policyname, cmd
   FROM pg_policies
   WHERE schemaname = 'public'
   AND tablename = 'spaces';
   ```
   You should see 4 policies:
   - "Users can view their spaces" (SELECT)
   - "Users can create spaces" (INSERT)
   - "Owners and admins can update spaces" (UPDATE)
   - "Owners can delete spaces" (DELETE)

2. **Check permissions:**
   ```sql
   SELECT privilege_type
   FROM information_schema.table_privileges
   WHERE table_schema = 'public'
   AND table_name = 'spaces'
   AND grantee = 'authenticated';
   ```
   You should see: SELECT, INSERT, UPDATE, DELETE

3. **Test deletion in the UI:**
   - Navigate to a space you own
   - Go to Settings
   - Click "Delete Space"
   - Confirm deletion
   - Should successfully delete and redirect to dashboard

## What the Fix Does

The `fix_spaces_deletion_rls.sql` script:

1. ✅ Enables RLS on the spaces table
2. ✅ Drops any conflicting old policies
3. ✅ Creates 4 clean policies:
   - **SELECT**: Users can view spaces they own or are members of
   - **INSERT**: Authenticated users can create spaces (as owner)
   - **UPDATE**: Owners and admins can update spaces
   - **DELETE**: Only owners can delete their spaces
4. ✅ Grants necessary permissions to the `authenticated` role
5. ✅ Provides diagnostic output to confirm success

## Expected Output

When you run the fix script, you should see:

```
================================
FIXING SPACES DELETION RLS
================================

✅ Created 4 policies on spaces table

📋 Current policies on spaces:
   - Owners and admins can update spaces
   - Owners can delete spaces
   - Users can create spaces
   - Users can view their spaces

================================
✅ SPACES DELETION FIX COMPLETE
================================

✅ Space owners can now:
   - View their spaces
   - Create new spaces
   - Update their spaces
   - Delete their spaces
```

## Troubleshooting

### Still getting "permission denied"?

1. **Verify you're the owner:**
   ```sql
   SELECT id, name, owner_id, auth.uid() as your_id
   FROM spaces
   WHERE id = 'YOUR_SPACE_ID';
   ```
   The `owner_id` must match `your_id`.

2. **Check if RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE tablename = 'spaces';
   ```
   `rowsecurity` should be `true`.

3. **Verify the DELETE policy exists:**
   ```sql
   SELECT *
   FROM pg_policies
   WHERE tablename = 'spaces'
   AND cmd = 'd';  -- 'd' means DELETE
   ```
   Should return the "Owners can delete spaces" policy.

### "Function auth.uid() does not exist"?

This means you're running queries outside the authenticated context. Make sure:
- You're logged in to the application
- Running the fix script via Supabase dashboard while authenticated
- Not trying to delete via direct database access

### Other Issues

1. **Multiple policy versions**: The fix script drops all old policies first to avoid conflicts
2. **Cascade failures**: Check the console for any cascade deletion errors
3. **Supabase cache**: Try refreshing your Supabase dashboard or reloading your app

## Related Files

- `scripts/fix_spaces_deletion_rls.sql` - The fix script
- `scripts/diagnose_spaces_rls.sql` - Diagnostic queries
- `lib/actions/space.ts` - Space deletion function (already updated with better error handling)
- `WORKSPACE_COMMENTS_FIX.md` - Related fix for workspace comment loading

## Prevention

To prevent this issue in future migrations:

1. Always include both RLS policies AND grants in migration scripts
2. Test each operation (SELECT, INSERT, UPDATE, DELETE) after enabling RLS
3. Use the diagnostic script template for verifying RLS configuration
4. Document which role needs which permissions

## Need Help?

If you're still stuck:
1. Run the diagnostic script and share the output
2. Check Supabase logs for detailed error messages
3. Verify your user is actually the space owner in the database

