# Fix Guide: Space Invitations "Permission Denied" Error

## Problem
When trying to invite members from Space Settings > Invitations, you're getting a "permission denied for table invitations" error.

## Root Cause
The RLS (Row Level Security) policy on the `invitations` table requires users to have admin or owner role in a space to create invitations. The issue is likely one of:

1. The `has_space_role` function signature has changed but the policy wasn't updated
2. The function is using an old enum type (`user_role`) instead of `text`
3. The user's role isn't being correctly checked

## Solution

### Step 1: Diagnose the Issue
Run the diagnostic script to check the current state:

```bash
# Connect to your Supabase database and run:
psql [your-connection-string] -f scripts/diagnose_invitations_rls.sql
```

This will show you:
- Current `has_space_role` function signature
- Current invitations RLS policies
- Whether RLS is enabled
- Table structure

### Step 2: Apply the Fix
Run the fix script to update the RLS policies and function:

```bash
psql [your-connection-string] -f scripts/fix_invitations_rls.sql
```

**OR** via Supabase Dashboard:
1. Go to Supabase Dashboard > SQL Editor
2. Open `scripts/fix_invitations_rls.sql`
3. Run the entire script

### Step 3: Verify the Fix
After applying the fix, test the invitation functionality:

1. Log in as a space owner or admin
2. Go to Space Settings > Invitations
3. Try to invite a new member
4. The invitation should now be created successfully

## What the Fix Does

1. **Recreates `has_space_role` function** with proper signature:
   - Takes `(p_space_id uuid, p_required_role text)`
   - Checks if `auth.uid()` has the required role in the space
   - Uses role hierarchy (owner > admin > member > viewer)

2. **Recreates invitations RLS policies**:
   - **SELECT**: Users can view invitations for spaces they're members of, or invitations sent to their email
   - **INSERT**: Space admins and owners can create invitations
   - **UPDATE**: Space admins and owners can update invitations
   - **DELETE**: Space admins and owners can delete invitations

## Alternative Quick Fix (if above doesn't work)

If the issue persists, you might need to check if the user is actually an admin of the space:

```sql
-- Check your role in a specific space
SELECT 
  sm.space_id,
  s.name as space_name,
  sm.role,
  sm.user_id
FROM space_members sm
JOIN spaces s ON s.id = sm.space_id
WHERE sm.user_id = auth.uid()
  AND sm.space_id = 'YOUR-SPACE-ID-HERE';
```

If you're not an admin or owner, you'll need to:
1. Have the current space owner promote you to admin
2. Or use an account that has admin/owner privileges

## Files Modified
- Created: `scripts/diagnose_invitations_rls.sql` - Diagnostic queries
- Created: `scripts/fix_invitations_rls.sql` - Fix script

## Testing Checklist
- [ ] Run diagnostic script to understand current state
- [ ] Run fix script to apply changes
- [ ] Log in as space admin/owner
- [ ] Navigate to Space Settings > Invitations
- [ ] Successfully create an invitation
- [ ] Verify invitation email is sent (if email service is configured)
- [ ] Test accepting the invitation with another account

## Notes
- This fix ensures backward compatibility with both old `user_role` enum and new text-based roles
- The fix uses `SECURITY DEFINER` to ensure the function can access the required tables
- The policies properly implement the role hierarchy (owner can do everything admin can do, etc.)

