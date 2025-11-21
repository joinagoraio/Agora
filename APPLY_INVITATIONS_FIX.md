# Apply Space Invitations Fix

## Quick Command

If you have your Supabase connection string set up:

```bash
# Set your connection string (one-time setup)
export SUPABASE_DB_URL="postgresql://postgres:[password]@[project-ref].supabase.co:5432/postgres"

# Apply the fix
psql $SUPABASE_DB_URL -f scripts/fix_invitations_rls.sql
```

## Or via Supabase Dashboard

1. Go to https://supabase.com/dashboard/project/[your-project]/sql
2. Click "New query"
3. Paste the contents of `scripts/fix_invitations_rls.sql`
4. Click "Run"

## What This Fixes

- ✅ Changes `has_space_role` function to accept `text` instead of `user_role` enum
- ✅ Recreates all invitations RLS policies with proper permissions
- ✅ Space admins and owners can now create invitations
- ✅ Users can view invitations for their spaces or sent to their email

## Test After Applying

1. Log into your app as a space owner/admin
2. Navigate to: Space Settings → Invitations tab
3. Enter an email address
4. Select a role (member, admin, etc.)
5. Click invite
6. ✨ Should work without "permission denied" error!

## Rollback (if needed)

If something goes wrong, you can restore the original by running `scripts/002_enable_rls.sql` again.

