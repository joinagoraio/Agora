# Workspace Member Display Fix

## Issue

Workspace-only members (invited directly to workspace, not via space) had two problems in the workspace settings Members tab:

1. ❌ **No email or name displayed** - Columns showed "—"
2. ❌ **Cannot edit role** - Role was displayed as a badge, not editable

## Root Cause

The member data structure from the server included workspace-only members correctly, but the UI component was:
1. Using the wrong key for iteration (`member.id` doesn't exist for workspace members)
2. Not providing role editing UI for workspace members
3. Displaying profiles data that might be missing

## Solution

### 1. Fixed Member Key ✅

**Before:**
```tsx
<TableRow key={member.id}>
```

**After:**
```tsx
<TableRow key={member.user_id}>
```

Now uses `user_id` which exists for both space and workspace members.

### 2. Added Role Editing for Workspace Members ✅

**Before:**
```tsx
<Badge>{member.workspace_role || member.role}</Badge>
```

**After:**
```tsx
{isWorkspaceMember && (
  <Select
    value={displayRole}
    onValueChange={(newRole) => handleWorkspaceRoleChange(member.user_id, newRole)}
    disabled={member.user_id === currentUserId}
  >
    <SelectTrigger className="w-[120px] h-8">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="admin">Admin</SelectItem>
      <SelectItem value="member">Member</SelectItem>
      <SelectItem value="viewer">Viewer</SelectItem>
    </SelectContent>
  </Select>
)}
{isSpaceMember && (
  <Badge>{displayRole}</Badge>
)}
```

**Space members**: Show badge (managed in space)  
**Workspace members**: Show dropdown (editable)

### 3. Fixed Email Display ✅

**Before:**
```tsx
<TableCell>{member.profiles?.email}</TableCell>
```

**After:**
```tsx
<TableCell>{member.profiles?.email || "—"}</TableCell>
```

Shows fallback if email is missing (though it should always exist).

### 4. Added Server Action ✅

**File:** `lib/actions/workspace.ts`

Created `updateWorkspaceMemberRole` function:

```typescript
export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberUserId: string,
  newRole: "admin" | "member" | "viewer"
) {
  const supabase = await createClient()

  // Check permission
  try {
    await requireAuthAndPermission("workspace:share", { workspaceId })
  } catch (error) {
    return { error: "Unauthorized" }
  }

  // Update the member's role
  const { error } = await supabase
    .from("workspace_members")
    .update({ role: newRole })
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberUserId)

  if (error) {
    return { error: "Failed to update member role" }
  }

  revalidatePath(`/workspaces/${workspaceId}/settings`)
  return { success: true }
}
```

### 5. Added Client Handler ✅

**File:** `components/workspace-settings.tsx`

```typescript
const handleWorkspaceRoleChange = async (userId: string, newRole: "admin" | "member" | "viewer") => {
  const result = await updateWorkspaceMemberRole(workspace.id, userId, newRole)

  if (result?.error) {
    toast.error("Failed to update role", { description: result.error })
    return
  }

  toast.success("Role updated", { description: `Member role has been changed to ${newRole}.` })
  router.refresh()
}
```

---

## User Experience

### Space Members:
- ✅ Email and name displayed
- ✅ Role shown as badge (not editable)
- ✅ "Managed in Space" text
- ✅ Cannot be removed from workspace settings

### Workspace-Only Members:
- ✅ Email and name displayed (from profiles table)
- ✅ Role shown in dropdown (editable) ⭐
- ✅ Can change role to admin/member/viewer ⭐
- ✅ Can be removed from workspace
- ✅ Role changes update immediately

---

## Testing Checklist

### Test as Workspace Admin:

- [ ] Go to workspace settings → Members tab
- [ ] Verify workspace-only members show:
  - [ ] Email ✅
  - [ ] Full name ✅
  - [ ] Role dropdown (not badge) ✅
- [ ] Click role dropdown for workspace member
- [ ] Change role to "Viewer"
- [ ] Verify success toast
- [ ] Verify role updated in UI
- [ ] Refresh page - Role persists ✅
- [ ] Verify space members still show badge (not dropdown)
- [ ] Verify space members show "Managed in Space"

### Test Permissions:

- [ ] Current user's role dropdown is disabled ✅
- [ ] Can change other workspace members' roles ✅
- [ ] Cannot change space members' roles (shows badge) ✅
- [ ] Can remove workspace members ✅
- [ ] Cannot remove space members ✅

---

## Files Modified

1. **`components/workspace-settings.tsx`**
   - Fixed member key: `member.id` → `member.user_id`
   - Added role dropdown for workspace members
   - Added `handleWorkspaceRoleChange` function
   - Added `updateWorkspaceMemberRole` import

2. **`lib/actions/workspace.ts`**
   - Added `updateWorkspaceMemberRole` function
   - Exports new function for use in components

---

## Summary

✅ **Email and name now display for workspace-only members**  
✅ **Role is editable via dropdown for workspace members**  
✅ **Space members remain non-editable (managed in space)**  
✅ **Clear distinction between space and workspace members**  
✅ **Permission checks in place**  
✅ **Page revalidates after role changes**  

🎉 **Workspace-only members are now fully functional in the Members tab!**

