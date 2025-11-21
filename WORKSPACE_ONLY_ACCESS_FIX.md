# Workspace-Only Member Access Fix

## Overview

Users invited directly to a workspace (not through space membership) should:
1. ✅ **NOT see "Back to Space" button** - Only see "Back to Dashboard"
2. ✅ **NOT be able to access the parent space** via URL - Redirected to dashboard
3. ✅ **See their workspace role badge** instead of space role

## Changes Made

### 1. Space Page Access Control ✅

**File:** `app/spaces/[spaceId]/page.tsx`

**What changed:**
- Added check to verify user is a space member
- Redirects to dashboard if user is NOT a space member (even if they're a workspace member)
- Removed fallback to "viewer" role

```typescript
// Get user's role in this space
const { data: membership } = await supabase
  .from("space_members")
  .select("role")
  .eq("space_id", spaceId)
  .eq("user_id", user.id)
  .single()

// If user is not a space member, they should not access this space
if (!membership) {
  console.error("[SpacePage] User is not a space member, redirecting to dashboard")
  redirect("/dashboard")
}
```

### 2. Workspace Page Navigation ✅

**File:** `app/workspaces/[workspaceId]/page.tsx`

**What changed:**
- Detects if user is a workspace-only member (no space membership)
- Conditionally renders navigation:
  - Space members: See "Back to {Space Name}"
  - Workspace-only members: See "Back to Dashboard"
- Shows appropriate role badge:
  - Space members: Show space role
  - Workspace-only members: Show workspace role

```typescript
// Get user's space role (if they're a space member)
const { data: spaceMembership } = await supabase
  .from("space_members")
  .select("role")
  .eq("space_id", workspace.space_id)
  .eq("user_id", user.id)
  .maybeSingle()

// Check if user is a direct workspace member (not via space)
const { data: workspaceMembership } = await supabase
  .from("workspace_members")
  .select("role")
  .eq("workspace_id", workspaceId)
  .eq("user_id", user.id)
  .maybeSingle()

// Determine if user is workspace-only
const isWorkspaceOnlyMember = !spaceMembership && !!workspaceMembership
```

**Header changes:**
```tsx
{!isWorkspaceOnlyMember && (
  <Button variant="ghost" asChild>
    <Link href={`/spaces/${workspaceWithSpace.spaces.id}`}>
      <ArrowLeft className="mr-2 h-3 w-3" />
      <span className="text-xs font-normal">Back to {workspaceWithSpace.spaces.name}</span>
    </Link>
  </Button>
)}
{isWorkspaceOnlyMember && (
  <Button variant="ghost" asChild>
    <Link href="/dashboard">
      <ArrowLeft className="mr-2 h-3 w-3" />
      <span className="text-xs font-normal">Back to Dashboard</span>
    </Link>
  </Button>
)}
```

### 3. Workspace Chat Page Navigation ✅

**File:** `app/workspaces/[workspaceId]/chat/page.tsx`

**What changed:**
- Same logic as workspace page
- Conditionally renders navigation:
  - Space members: "Back to {Space Name}"
  - Workspace-only members: "Back to Workspace"
- Shows appropriate role badge

---

## User Experience

### For Space Members (owner/admin/member/viewer):

1. **Dashboard** → Shows spaces they're a member of
2. **Space Page** → Can access ✅
3. **Workspace Page** → Shows "Back to {Space Name}" button ✅
4. **Chat Page** → Shows "Back to {Space Name}" button ✅
5. **Role Badge** → Shows space role (owner/admin/member/viewer) ✅

### For Workspace-Only Members (invited directly):

1. **Dashboard** → Shows workspaces in "My Workspaces" section ✅
2. **Space Page** → CANNOT access (redirected to dashboard) ✅
3. **Workspace Page** → Shows "Back to Dashboard" button ✅
4. **Chat Page** → Shows "Back to Workspace" button ✅
5. **Role Badge** → Shows workspace role (admin/member/viewer) ✅
6. **No Space Context** → Never see space name or space navigation ✅

---

## Flow Diagram

### Space Member Flow:
```
Dashboard
  └── Space (can access)
        └── Workspace (back to space)
              └── Chat (back to space)
```

### Workspace-Only Member Flow:
```
Dashboard
  └── Workspace (back to dashboard)
        └── Chat (back to workspace)
  
  ❌ Space (cannot access - redirected to dashboard)
```

---

## Testing Checklist

### Test as Workspace-Only Member:

- [ ] Accept workspace invitation (not space invitation)
- [ ] Go to dashboard - See workspace in "My Workspaces" section
- [ ] Click workspace - Opens workspace page
- [ ] Verify: See "Back to Dashboard" button (NOT "Back to Space")
- [ ] Verify: See workspace role badge (admin/member/viewer)
- [ ] Try to access space via URL - Redirected to dashboard
- [ ] Go to chat page
- [ ] Verify: See "Back to Workspace" button
- [ ] Verify: See workspace role badge
- [ ] Verify: No space name or space navigation anywhere

### Test as Space Member:

- [ ] Go to space page - Can access
- [ ] Click workspace - Opens workspace page
- [ ] Verify: See "Back to {Space Name}" button
- [ ] Verify: See space role badge
- [ ] Go to chat page
- [ ] Verify: See "Back to {Space Name}" button
- [ ] Verify: See space role badge
- [ ] Click "Back to {Space Name}" - Goes to space page ✅

---

## Security

✅ **Database Level**: RLS policies enforce workspace access  
✅ **Application Level**: Space page redirects non-members  
✅ **UI Level**: Navigation buttons reflect actual permissions  

Workspace-only members cannot:
- Access the parent space via URL (redirected)
- See space navigation (buttons hidden)
- View space role (shows workspace role instead)

---

## Files Modified

1. `app/spaces/[spaceId]/page.tsx` - Added access control check
2. `app/workspaces/[workspaceId]/page.tsx` - Conditional navigation and role badge
3. `app/workspaces/[workspaceId]/chat/page.tsx` - Conditional navigation and role badge

---

## Summary

✅ **Workspace-only members CANNOT access the parent space**  
✅ **"Back to Space" button hidden for workspace-only members**  
✅ **Workspace-only members see "Back to Dashboard" instead**  
✅ **Appropriate role badge shown (space role vs workspace role)**  
✅ **Clean separation between space members and workspace-only members**  

🎉 **Workspace-only access is now properly isolated from space access!**

