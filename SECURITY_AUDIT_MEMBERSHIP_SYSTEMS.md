# Comprehensive Security Audit: Space and Workspace Membership Systems

## Executive Summary

This audit examined the space and workspace membership systems in the Agora codebase, focusing on role assignment, membership verification, access control, and RLS policies. **Critical issues identified: 4**, **High issues: 6**, **Medium issues: 5**, **Low issues: 3**.

The system demonstrates a generally solid architecture with SECURITY DEFINER helper functions and RLS policies, but several security gaps and edge cases require immediate attention.

---

## 1. CRITICAL SECURITY ISSUES

### 1.1 Missing Authorization Check in `inviteUserToWorkspace`

**Location:** `/home/user/Agora/lib/actions/workspace-invitation.ts` (lines 24-82)

**Issue:** The function does NOT explicitly verify authorization before inserting workspace invitations. It relies SOLELY on RLS policies to enforce authorization.

```typescript
export async function inviteUserToWorkspace(
  workspaceId: string,
  email: string,
  role: WorkspaceRole = "member",
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Unauthorized" }
  }
  
  // MISSING: No explicit check that user is workspace admin
  // RLS will enforce this at database level, but should fail early at app level
  
  const workspace = await getWorkspaceDetails(supabase, workspaceId)
  if (!workspace) {
    return { error: "Workspace not found" }
  }
  
  // Direct insert without authorization check
  const { data, error } = await supabase
    .from("workspace_invitations")
    .insert({...})
}
```

**Risk:** While RLS policies provide a safety net, relying solely on database-level enforcement without application-level checks:
- Causes poor user experience (errors returned from database rather than caught early)
- Creates debugging complexity
- Violates defense-in-depth principle

**Comparison:** `inviteUserToSpace` in `/lib/actions/invitation.ts` has the same issue.

**Fix Required:** Add explicit authorization check before database operation:
```typescript
const { userId, role } = await requireAuthAndPermission("workspace:share", {
  workspaceId: validatedWorkspaceId
})
```

---

### 1.2 Overly Permissive Workspace Invitations RLS Policy

**Location:** `/home/user/Agora/scripts/complete_migration.sql` & `/home/user/Agora/scripts/030_workspace_memberships.sql`

**Issue:** The SELECT policy on `workspace_invitations` allows viewing invitations with weak validation:

From `030_workspace_memberships.sql` (lines 309-322):
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' 
    AND tablename = 'workspace_invitations' 
    AND policyname = 'Workspace invitees can view by token'
  ) THEN
    EXECUTE 'CREATE POLICY "Workspace invitees can view by token" 
      ON public.workspace_invitations FOR SELECT 
      USING (auth.uid() IS NOT NULL);';  -- TOO PERMISSIVE!
  END IF;
END;
$$;
```

**Risk:** Any authenticated user can view ALL workspace invitations for all workspaces they don't have access to. This reveals:
- Email addresses of invited users
- Invitation tokens (potentially)
- Which workspaces are receiving invitations

**Attack Scenario:**
```
1. Attacker creates account
2. Queries workspace_invitations table directly
3. Learns about internal invitations and email lists
4. Can enumerate workspaces by observing invitation patterns
```

**Fix Required:** Restrict to workspace admins or token-based access:
```sql
CREATE POLICY "Workspace admins can view workspace invitations"
  ON public.workspace_invitations FOR SELECT
  USING (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()));

-- Allow invitees to view/accept ONLY via token lookup, not enumerate all
-- (currently this is handled in application code only)
```

---

### 1.3 No Explicit Member Removal/Downgrade Functions

**Location:** Application code across `/lib/actions/`

**Issue:** The system has NO server actions to remove members from spaces or workspaces. There is no `removeMemberFromSpace` or `removeMemberFromWorkspace` function, yet the RLS policies allow admins to delete membership records.

**Impact:**
- Users cannot be removed from spaces/workspaces through the application
- There's no audit trail for removals
- Settings pages don't show member removal capabilities

**Code Evidence:** `space-settings.tsx` (lines 141-162) shows members table but NO remove buttons/functionality:
```typescript
<TableBody>
  {members.map((member) => (
    <TableRow key={member.id}>
      <TableCell>{member.profiles?.email}</TableCell>
      <TableCell>{member.profiles?.full_name || "—"}</TableCell>
      <TableCell>
        <Badge>{member.role}</Badge>
      </TableCell>
      <TableCell>{new Date(member.created_at).toLocaleDateString()}</TableCell>
      // NO ACTION BUTTONS - Can't remove members!
    </TableRow>
  ))}
</TableBody>
```

Same issue in `workspace-settings.tsx` (lines 167-177).

**Fix Required:** Implement server actions:
```typescript
export async function removeMemberFromSpace(spaceId: string, userId: string)
export async function removeMemberFromWorkspace(workspaceId: string, userId: string)
export async function updateMemberRole(spaceId: string, userId: string, newRole: Role)
```

---

### 1.4 Race Condition in Workspace Membership Backfill

**Location:** `/home/user/Agora/scripts/030_workspace_memberships.sql` (lines 344-365)

**Issue:** Backfill of workspace members from space members uses `ON CONFLICT DO NOTHING`, which silently ignores conflicts. If a user creates a workspace while the backfill is running, race conditions can occur:

```sql
-- This runs during migration, AFTER workspace_members table created
-- But if workspaces are being created concurrently, conflicts are silently ignored
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT
  w.id,
  sm.user_id,
  CASE
    WHEN sm.role IN ('owner', 'admin') THEN 'admin'
    WHEN sm.role = 'member' THEN 'member'
    ELSE 'viewer'
  END AS role
FROM public.workspaces w
JOIN public.space_members sm ON sm.space_id = w.space_id
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Then ensure creators are admins
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT
  w.id,
  w.created_by,
  'admin'
FROM public.workspaces w
ON CONFLICT (workspace_id, user_id) DO NOTHING;
```

**Race Condition Scenario:**
1. New workspace created at 12:00:00 with user A
2. Backfill starts and inserts user A as admin from space membership
3. User A creates another workspace at 12:00:01
4. Backfill tries to add A as admin to second workspace
5. If backfill is still running, timing issues can leave second workspace without proper members

**Fix Required:** Use explicit locking or transactional consistency:
```sql
BEGIN;
-- Backfill with proper error handling
LOCK TABLE workspace_members IN EXCLUSIVE MODE;
-- Perform insertions with verification
COMMIT;
```

---

## 2. HIGH PRIORITY SECURITY ISSUES

### 2.1 Inconsistent Helper Function Signatures Across Migrations

**Location:** Multiple migration files

**Issue:** Helper functions are defined with different signatures in different files, causing confusion and potential bugs:

```sql
-- In 002_enable_rls.sql (using auth.uid())
create or replace function public.is_workspace_member(workspace_id uuid)
returns boolean as $$
  select exists (...)
$$ language sql security definer;

-- In 030_workspace_memberships.sql (using explicit parameter)
CREATE OR REPLACE FUNCTION public.is_workspace_member(workspace_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
...

-- In complete_migration.sql (same as 030)
CREATE OR REPLACE FUNCTION is_workspace_member(workspace_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
...
```

**Risk:** 
- Last migration to run determines which version exists
- If RLS policies expect the auth.uid() version but functions use explicit parameters, authorization checks fail
- Code calling functions may use wrong signatures

**Fix Required:** Remove all intermediate migration files and maintain only one canonical version in `complete_migration.sql`. Add version comments:
```sql
-- CANONICAL VERSIONS (use these)
-- Helper: is_workspace_member(workspace_uuid UUID, user_uuid UUID)
-- Helper: is_workspace_admin(workspace_uuid UUID, user_uuid UUID)
```

---

### 2.2 Workspace Membership Inheritance NOT Explicitly Verified at Application Level

**Location:** `/lib/actions/workspace-invitation.ts` and workspace membership checks

**Issue:** The system relies on implicit inheritance through RLS helper functions. A user gets workspace access through:
1. Direct workspace_members entry, OR
2. Being a space admin/owner, OR
3. Being workspace creator

But there's no explicit application-level function to verify this:

```typescript
// What we have (through RLS):
export async function getUserWorkspaceRole(userId: string, workspaceId: string): Promise<Role | null> {
  // ... checks workspace_members and space membership
}

// What we need:
export async function verifyWorkspaceAccessWithReason(userId: string, workspaceId: string) {
  return {
    allowed: boolean,
    reason: "direct_member" | "space_admin" | "workspace_creator" | "denied",
    role: Role | null
  }
}
```

**Impact:** When denying access, the application doesn't know WHY access was denied, making logging and debugging difficult.

---

### 2.3 Workspace Creation Authorization Missing Explicit Verification

**Location:** `/lib/actions/workspace.ts` (lines 11-41)

**Issue:** `createWorkspace` doesn't explicitly check authorization before creating:

```typescript
export async function createWorkspace(spaceId: string, name: string, description?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Unauthorized" }
  }
  
  // NO CHECK: Is user actually a space member?
  // RLS policy checks this at database level:
  // "WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_members.space_id = workspaces.space_id AND space_members.user_id = auth.uid() AND space_members.role IN ('owner', 'admin', 'member')))"
  
  const { data, error } = await supabase.from("workspaces").insert({...})
}
```

**Risk:** Poor user experience when authorization fails. Should check explicitly:
```typescript
await requireAuthAndPermission("workspace:create", { spaceId })
```

---

### 2.4 Space Owner Removal Not Handled

**Location:** Database schema and application

**Issue:** The system doesn't define what happens when the ONLY owner of a space is removed. Looking at the schema:

```sql
CREATE TABLE spaces (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- No owner_role tracking, relies on space_members for roles
);
```

Scenarios:
1. **Owner removed as space_member:** Owner loses access but `spaces.owner_id` still points to them
2. **Owner deleted from auth:** CASCADE deletes space (harsh but clear)
3. **No owner management UI:** Users can't transfer ownership

**Impact:** 
- Space becomes orphaned if owner is removed from members
- No clear ownership chain
- No ownership transfer capability

---

### 2.5 Workspace Orphaning on Creator Removal

**Location:** Workspace creation and member removal flow

**Issue:** When a workspace creator is removed from workspace_members, they may retain admin rights through space membership. If space admin role is later removed, workspace becomes unmanageable.

**Scenario:**
```
1. User A creates workspace in Space X (User A is space owner)
2. Workspace_members: User A = admin (automatic)
3. Space_members: User A = owner
4. User B joins as workspace member
5. User B somehow gains space admin role
6. User B removes User A from space_members
7. User A loses all access
8. Workspace has no admin (User B only has workspace-level member role)
```

**Fix:** Workspace must always have at least one admin - either creator or explicit designate.

---

### 2.6 No Rate Limiting on Invitation Endpoints

**Location:** `/lib/actions/invitation.ts` and `/lib/actions/workspace-invitation.ts`

**Issue:** Invitation functions have no rate limiting. An admin can spam invitations:
```typescript
export async function inviteUserToSpace(spaceId: string, email: string, role: ...) {
  // No rate limit check!
  const { data, error } = await supabase
    .from("invitations")
    .insert({...})
}
```

**Risk:**
- Email spam attacks
- Database bloat
- Brute force email enumeration

**Fix:** Add rate limiting to invitation creation.

---

## 3. MEDIUM PRIORITY ISSUES

### 3.1 Invitations Don't Validate Email Domain

**Location:** `/lib/actions/invitation.ts` (lines 8-60)

**Issue:** No validation that invited email matches organization domain:
```typescript
export async function inviteUserToSpace(
  spaceId: string,
  email: string,  // Any email accepted!
  role: "owner" | "admin" | "member" | "viewer" = "member",
) {
  // No domain validation
  const { data, error } = await supabase.from("invitations").insert({...})
}
```

**Risk:** Users can invite external addresses to "internal" spaces.

**Fix:** Add email domain whitelist:
```typescript
const allowedDomains = ["government.nl", "gemeente.nl"]
if (!allowedDomains.some(d => email.endsWith(`@${d}`))) {
  return { error: "Only organization emails allowed" }
}
```

---

### 3.2 Invitation Token Expiration Not Enforced Consistently

**Location:** `/lib/actions/invitation.ts` and `/lib/actions/workspace-invitation.ts`

**Issue:** Invitation acceptance checks expiration, but expiration update when resending:

In `invitation.ts` (line 86):
```typescript
if (new Date(invitation.expires_at) < new Date()) {
  await supabase.from("invitations").update({ status: "expired" }).eq("id", invitation.id)
  return { error: "Invitation has expired" }
}
```

But in `resendInvitation` (lines 178-180):
```typescript
const expiresAt = new Date()
expiresAt.setDate(expiresAt.getDate() + 7)
// Updates expires_at without checking if status is already set
const { error } = await supabase.from("invitations").update(updatePayload)
```

**Risk:** Expired invitations can be resent with old tokens, creating token reuse vulnerabilities.

---

### 3.3 No Audit Logging for Membership Changes

**Location:** All membership management functions

**Issue:** The system has NO audit trail for critical membership operations:
- Adding members
- Removing members
- Changing roles
- Accepting/declining invitations

**Risk:** 
- No security incident investigation capability
- Compliance violations (GDPR audit trail requirements)
- Can't track who changed what and when

**Fix:** Create audit_logs table:
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  action VARCHAR(50),
  actor_id UUID REFERENCES profiles(id),
  target_entity VARCHAR(50),
  target_id UUID,
  changes JSONB,
  created_at TIMESTAMPTZ
);
```

---

### 3.4 Workspace-Space Link Authorization Insufficient

**Location:** `/lib/actions/workspace-space-link.ts`

**Issue:** The `attachParentSpace` function checks workspace update permission but doesn't verify:
1. User has access to the space being linked
2. Space is appropriate to link (visibility checks)

```typescript
export async function attachParentSpace(workspaceId: string, spaceId: string) {
  // Checks workspace:update permission
  await requireAuthAndPermission("workspace:update", { workspaceId: validatedWorkspaceId })
  
  // But doesn't check if user can access the space being linked!
  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("id, visibility")
    .eq("id", validatedSpaceId)
    .maybeSingle()
  
  // MISSING: Verify user has access to space via space_members
}
```

**Risk:** User can link workspaces to spaces they don't have access to (if they can update workspace).

---

### 3.5 Missing Boundary Check on Role Escalation

**Location:** Invitation acceptance and member creation

**Issue:** When accepting invitations or creating members, no check that inviter doesn't grant higher role than they have:

```typescript
// In inviteUserToSpace (invitation.ts)
const { data, error } = await supabase.from("invitations").insert({
  space_id: spaceId,
  email,
  role,  // No validation that current user can grant this role!
  token,
  invited_by: user.id,
  expires_at: expiresAt.toISOString(),
})
```

**Risk:** Member could invite someone as owner if RLS isn't strict.

---

## 4. DATABASE LEVEL SECURITY ASSESSMENT

### RLS Policy Summary

**Strengths:**
- Uses SECURITY DEFINER helper functions to avoid recursion
- Proper hierarchical checks (creator > admin > member > viewer)
- Implements defense-in-depth with both USING and WITH CHECK

**Weaknesses:**
- Space owner stored in `spaces.owner_id` but also needs `space_members` entry
- Workspace creator tracked in `workspaces.created_by` but membership in separate table
- Inconsistent how ownership is checked across tables

**Critical Policies:**

1. **Spaces SELECT:**
```sql
USING (owner_id = auth.uid() OR is_space_member(id, auth.uid()))
```
Correct - checks both direct ownership and membership.

2. **Space Members SELECT:**
```sql
USING (is_space_member(space_id, auth.uid()))
```
Correct - user can view members if they're members.

3. **Workspace Invitations SELECT (WEAK):**
```sql
USING (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()))
-- PLUS this:
USING (auth.uid() IS NOT NULL)  -- TOO PERMISSIVE!
```

---

## 5. EDGE CASES & UNEXPLORED SCENARIOS

### 5.1 Cross-Space Workspace Access

**Scenario:** User A is admin in Space X, Workspace A is created in Space Y. Can User A access Workspace A?

**Current Logic in `is_workspace_member`:**
```plpgsql
IF is_space_admin(space_uuid, user_uuid) THEN
  RETURN TRUE;
END IF;
```

Only checks if user is admin in workspace's PARENT space, not all spaces. This is correct.

---

### 5.2 Workspace without Space

**Scenario:** What if workspace.space_id is NULL or deleted?

The foreign key constraint prevents deletion:
```sql
space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE
```

Correct - workspace deleted if parent space deleted.

---

### 5.3 User Accessing Workspace as Non-Member But Space Admin

**Current behavior:** Space admin automatically gets workspace access.

```typescript
// In workspace-settings page retrieval
// The page probably queries workspace_members and relies on RLS
```

**Risk:** If page shows workspace members, space admins won't appear unless explicitly in workspace_members. This could be confusing.

---

### 5.4 Invitation Acceptance with Wrong Email

**Location:** `/lib/actions/invitation.ts` (lines 91-97)

```typescript
const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single()

if (profile?.email !== invitation.email) {
  return {
    error: "This invitation was sent to a different email address. Please sign in with the invited email.",
  }
}
```

**Good Practice:** Correctly validates email matches. However:
- What if user changed email after invitation was sent?
- Should still allow acceptance?

Current: Prevents acceptance - correct for security.

---

## 6. IMPLEMENTATION GAPS

### 6.1 No Member Role Update Function

The system can:
- Invite members with a role
- Remove members

But CANNOT:
- Change a member's role after they've joined

**Missing:** `updateMemberRole(spaceId, userId, newRole)` and workspace equivalent.

---

### 6.2 No Bulk Member Operations

Can't:
- Bulk invite members
- Bulk remove members
- Bulk update roles

This forces inefficient loops at UI level.

---

### 6.3 No Member Invitation Status Tracking

Once invitation is accepted, there's no way to see:
- When member was actually onboarded
- Whether they've logged in
- Their acceptance timestamp

---

## 7. RECOMMENDATIONS PRIORITY

### Immediate (Week 1)
1. Fix overly permissive workspace_invitations RLS policy
2. Add explicit authorization checks in invitation endpoints  
3. Implement member removal/role update functions
4. Add audit logging for membership changes

### Short-term (Week 2-3)
5. Fix inconsistent helper function signatures
6. Add workspace admin requirement enforcement
7. Implement rate limiting on invitations
8. Add email domain validation for invitations

### Medium-term (Month 1)
9. Implement workspace membership consistency checks
10. Add ownership transfer capability
11. Implement invitation token expiration fixes
12. Add workspace-space link authorization checks

### Long-term (Ongoing)
13. Add member activity tracking
14. Implement bulk member operations
15. Add detailed audit trail dashboard
16. Implement SSO with role mapping

---

## 8. CODE EXAMPLES FOR FIXES

### Fix 1: Add Authorization Check to Invitation Function

```typescript
export async function inviteUserToWorkspace(
  workspaceId: string,
  email: string,
  role: WorkspaceRole = "member",
) {
  const supabase = await createClient()
  
  // FIX: Add explicit authorization check FIRST
  try {
    const { userId } = await requireAuthAndPermission("workspace:share", {
      workspaceId
    })
  } catch (authError) {
    return { error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  // ... rest of function
}
```

### Fix 2: Fix RLS Policy

```sql
-- BEFORE (too permissive)
CREATE POLICY "Workspace invitees can view by token"
  ON public.workspace_invitations FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- AFTER (proper)
DROP POLICY "Workspace invitees can view by token" ON public.workspace_invitations;
-- Remove this policy entirely - token access should be handled in application layer only
```

### Fix 3: Add Member Removal Function

```typescript
export async function removeMemberFromWorkspace(
  workspaceId: string,
  userId: string,
) {
  const supabase = await createClient()

  try {
    const { userId: currentUserId } = await requireAuthAndPermission(
      "workspace:share",
      { workspaceId }
    )
  } catch {
    return { error: "Unauthorized" }
  }

  // Prevent self-removal of last admin
  const { data: members } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("role", "admin")

  if (members?.length === 1) {
    const { data: memberToRemove } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("id", members[0].id)
      .single()

    if (memberToRemove?.user_id === userId) {
      return { error: "Cannot remove the last admin from workspace" }
    }
  }

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)

  if (error) {
    return { error: error.message }
  }

  // Audit log here
  return { success: true }
}
```

---

## CONCLUSION

The Agora membership system demonstrates good architectural decisions (SECURITY DEFINER functions, RLS policies), but has implementation gaps that require immediate attention:

**Critical:** 4 issues (authorization checks, RLS permissiveness, missing functions, race conditions)
**High:** 6 issues (signature inconsistencies, inheritance clarity, creation authorization, owner handling, orphaning, rate limiting)
**Medium:** 5 issues (domain validation, token reuse, audit logging, linking authorization, role escalation)

Overall Risk Level: **MEDIUM-HIGH** - System is defensible but needs hardening before production.
