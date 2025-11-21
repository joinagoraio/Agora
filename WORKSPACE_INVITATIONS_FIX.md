# Workspace Invitations RLS Fix

## Problem
Workspace invitations were failing with "permission denied for table workspace_invitations" error.

## Root Cause
The workspace_invitations table had overly permissive and incomplete RLS policies:
- **Overly permissive SELECT**: Any authenticated user could view ALL workspace invitations
- **Overly permissive UPDATE**: Any authenticated user could update ANY invitation
- **Missing INSERT policy**: No policy allowing workspace admins to create invitations
- **Missing DELETE policy**: No policy for revoking invitations
- **Missing table grants**: Authenticated users didn't have proper table-level permissions

## Solution
Created comprehensive RLS policies similar to the space invitations fix:

### 1. Table Grants
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
```

### 2. Function Grants
```sql
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO authenticated;
```

### 3. RLS Policies

#### Policy 1: SELECT (View Invitations)
Allows users to view invitations if:
- They are a member of the workspace
- They are an admin of the space that owns the workspace
- The invitation is sent to their email
- They have the invitation token

#### Policy 2: INSERT (Create Invitations) ← **THIS FIXES THE ERROR**
Allows users to create invitations if:
- They are an admin of the workspace
- They are an admin of the space that owns the workspace

#### Policy 3: UPDATE (Modify Invitations)
Allows users to update invitations if:
- They are an admin of the workspace
- They are an admin of the space that owns the workspace
- They are the invitee (can accept/decline their own invitation)

#### Policy 4: DELETE (Revoke Invitations)
Allows users to delete invitations if:
- They are an admin of the workspace
- They are an admin of the space that owns the workspace

## Files Created/Modified

### New Files:
- `scripts/fix_workspace_invitations_rls.sql` - Complete RLS fix script
- `scripts/allow_public_workspace_viewing_for_invites.sql` - Allow anonymous users to view workspace names
- `app/workspace-invite/[token]/workspace-invite-page-client.tsx` - Client component for invitation page

### Modified Files:
- `app/workspace-invite/[token]/page.tsx` - Updated to fetch invitation before auth check
- `lib/actions/workspace-invitation.ts` - Server action that calls the database
- `components/workspace-settings.tsx` - UI that triggers invitations (removed invitation link display)
- `app/workspaces/[workspaceId]/settings/page.tsx` - Settings page

## Running the Fix

You need to run **TWO** SQL scripts in order:

### Step 1: Fix RLS Policies

```bash
# Connect to your Supabase database
psql "postgresql://postgres:[password]@[host]:[port]/postgres"

# Run the RLS fix script
\i scripts/fix_workspace_invitations_rls.sql
```

Or via Supabase dashboard:
1. Go to SQL Editor
2. Copy contents of `scripts/fix_workspace_invitations_rls.sql`
3. Execute

### Step 2: Allow Public Workspace Viewing

```bash
# Run the public viewing script
\i scripts/allow_public_workspace_viewing_for_invites.sql
```

Or via Supabase dashboard:
1. Go to SQL Editor
2. Copy contents of `scripts/allow_public_workspace_viewing_for_invites.sql`
3. Execute

**Why two scripts?**
- Script 1: Fixes the main RLS policies and grants
- Script 2: Allows anonymous users to view workspace names (needed for invitation page)

## Testing Checklist

After running the script, test these scenarios:

### As Workspace Admin:
- [ ] ✅ Can send invitation to new user
- [ ] ✅ Can view all workspace invitations
- [ ] ✅ Can resend invitation
- [ ] ✅ Can revoke invitation
- [ ] ✅ Can see invitation status updates

### As Workspace Member:
- [ ] ✅ Can view workspace invitations
- [ ] ❌ Cannot create new invitations
- [ ] ❌ Cannot delete invitations

### As Space Admin (for workspace in their space):
- [ ] ✅ Can send invitation to workspace
- [ ] ✅ Can view workspace invitations
- [ ] ✅ Can revoke workspace invitations

### As Invitee:
- [ ] ✅ Can view invitation sent to their email
- [ ] ✅ Can accept invitation
- [ ] ✅ Can decline invitation
- [ ] ❌ Cannot view other people's invitations

### As Viewer:
- [ ] ❌ Cannot create invitations
- [ ] ❌ Cannot view other users' invitations
- [ ] ❌ Cannot delete invitations

## Comparison with Space Invitations

The workspace invitations now have the same security model as space invitations:

| Feature | Space Invitations | Workspace Invitations |
|---------|-------------------|----------------------|
| Admin can create | ✅ | ✅ |
| Member can create | ❌ | ❌ |
| Viewer can create | ❌ | ❌ |
| Token-based viewing | ✅ | ✅ |
| Invitee can accept | ✅ | ✅ |
| Admin can revoke | ✅ | ✅ |
| Table grants | ✅ | ✅ |
| Function grants | ✅ | ✅ |

## Security Improvements

Before:
```sql
-- INSECURE: Any authenticated user could view ALL invitations
CREATE POLICY "Workspace invitees can view by token" 
  ON workspace_invitations FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- INSECURE: Any authenticated user could update ANY invitation
CREATE POLICY "Workspace invitees can update their invitations" 
  ON workspace_invitations FOR UPDATE 
  USING (auth.uid() IS NOT NULL);

-- MISSING: No INSERT policy at all!
```

After:
```sql
-- SECURE: Only authorized users can view relevant invitations
CREATE POLICY "Workspace members can view invitations"
  ON workspace_invitations FOR SELECT
  USING (
    is_workspace_member(workspace_id, auth.uid())
    OR [other secure conditions]
  );

-- SECURE: Only workspace/space admins can create
CREATE POLICY "Workspace admins can create invitations"
  ON workspace_invitations FOR INSERT
  WITH CHECK (
    is_workspace_admin(workspace_id, auth.uid())
    OR [space admin check]
  );

-- Plus proper UPDATE and DELETE policies
```

## Related Issues Fixed

1. ✅ "Permission denied for table workspace_invitations" error
2. ✅ Security vulnerability: any user could view all workspace invitations
3. ✅ Security vulnerability: any user could modify any invitation
4. ✅ Missing ability to revoke invitations
5. ✅ Inconsistency between space and workspace invitation security
6. ✅ Users redirected to sign-in instead of seeing invitation page
7. ✅ Anonymous users can now view invitation details before signing up
8. ✅ Workspace names visible on invitation page (like space invitations)

## References

- Similar fix for space invitations: `SPACE_INVITATIONS_FIX_COMPLETE.md`
- Space invitations script: `scripts/fix_invitations_rls_v4_clean.sql`
- Security audit: `SECURITY_AUDIT_MEMBERSHIP_SYSTEMS.md`

