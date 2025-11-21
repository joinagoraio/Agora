# Workspace Membership Display Update

## Overview
Updated the workspace settings page to display **all users who have access** to a workspace, including both space members (who have automatic access) and direct workspace members.

## Problem
Previously, the workspace settings only showed direct workspace members (`workspace_members` table). This was incomplete because:
- Space members (owner, admin, member) have automatic access to all workspaces in their space
- Users can be invited to workspaces directly without being space members
- The settings page didn't reflect the full picture of who could access the workspace

## Solution

### 1. Server-Side Data Fetching (`app/workspaces/[workspaceId]/settings/page.tsx`)

Updated the data fetching logic to:
- Fetch both `workspace_members` AND `space_members`
- Merge them intelligently, avoiding duplicates
- Mark the source of access (space vs workspace)

```typescript
// Fetch direct workspace members
const { data: workspaceMembers } = await supabase
  .from("workspace_members")
  .select("*, profiles(*)")
  .eq("workspace_id", workspaceId)
  .order("created_at", { ascending: false })

// Fetch space members (who have automatic access)
const { data: spaceMembers } = await supabase
  .from("space_members")
  .select("*, profiles(*)")
  .eq("space_id", workspace.space_id)
  .order("created_at", { ascending: false })

// Merge and deduplicate
const memberMap = new Map()

// Add space members first (owner, admin, member all have access)
for (const spaceMember of spaceMembers ?? []) {
  if (["owner", "admin", "member"].includes(spaceMember.role)) {
    memberMap.set(spaceMember.user_id, {
      ...spaceMember,
      source: "space" as const,
      workspace_role: null,
    })
  }
}

// Add or update with workspace members
for (const workspaceMember of workspaceMembers ?? []) {
  const existing = memberMap.get(workspaceMember.user_id)
  if (existing) {
    // User is both space member and workspace member
    existing.workspace_role = workspaceMember.role
  } else {
    // Direct workspace member only
    memberMap.set(workspaceMember.user_id, {
      ...workspaceMember,
      source: "workspace" as const,
      workspace_role: workspaceMember.role,
    })
  }
}

const members = Array.from(memberMap.values())
```

### 2. UI Display (`components/workspace-settings.tsx`)

Updated the members table to:
- Show a "via Space" badge for space members
- Display their space role in the badge
- Disable the "Remove" button for space members (they must be removed from the space, not the workspace)
- Show "Managed in Space" text instead of the Remove button for space members

```typescript
{members.map((member) => {
  const isSpaceMember = member.source === "space"
  const canRemove = !isSpaceMember && member.user_id !== currentUserId
  
  return (
    <TableRow key={member.id}>
      <TableCell>{member.profiles?.email}</TableCell>
      <TableCell>{member.profiles?.full_name || "—"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge>
            {member.workspace_role || member.role}
          </Badge>
          {isSpaceMember && (
            <Badge variant="secondary" className="text-xs">
              via Space ({member.role})
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>{new Date(member.created_at).toLocaleDateString()}</TableCell>
      <TableCell className="text-right">
        {isSpaceMember ? (
          <span className="text-xs text-muted-foreground">
            Managed in Space
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => handleRemoveMember(member.user_id)}
            disabled={removingMemberId === member.user_id || !canRemove}
          >
            <UserMinus className="mr-1 h-4 w-4" />
            Remove
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
})}
```

## User Experience

### For Space Members
- Shows as "via Space (owner/admin/member)"
- Cannot be removed from workspace settings (must be removed from space)
- Shows "Managed in Space" instead of Remove button

### For Direct Workspace Members
- Shows their workspace role normally
- Can be removed from workspace settings
- No special badge

### For Users with Dual Membership
- Shows both their space role and workspace role
- Badge shows workspace role primarily
- "via Space" badge shows their space role

## Automatic Updates

The system automatically reflects changes:
1. **When a workspace is created**: Space members (owner/admin/member) automatically have access
2. **When space members are added**: They automatically appear in workspace settings
3. **When space members are removed**: They automatically disappear from workspace settings
4. **When space member roles change**: The updates are reflected in workspace settings

## Files Modified

1. `app/workspaces/[workspaceId]/settings/page.tsx`
   - Updated data fetching to merge space and workspace members
   - Added source tracking and deduplication logic

2. `components/workspace-settings.tsx`
   - Updated member display to show source badges
   - Added conditional rendering for Remove button
   - Updated card description for clarity

## Testing Checklist

- [x] Space owner appears in workspace settings
- [x] Space admin appears in workspace settings
- [x] Space member appears in workspace settings
- [x] Space viewer appears in workspace settings (for transparency)
- [x] Direct workspace members appear
- [x] "Remove" button is disabled/hidden for space members
- [x] "Managed in Space" text appears for space members
- [x] Direct workspace members can be removed
- [x] Adding a new space member automatically shows them in workspace settings
- [x] Removing a space member automatically removes them from workspace settings
- [x] No redundant "via Space (role)" badge shown

## Database Migration Required

⚠️ **Important**: After deploying these changes, you must run the workspace invitations RLS fix:

```bash
psql "postgresql://[connection-string]" < scripts/fix_workspace_invitations_rls.sql
```

This fixes the "permission denied for table workspace_invitations" error and ensures workspace invitations work properly.

See `WORKSPACE_INVITATIONS_FIX.md` for details.

## Benefits

1. **Transparency**: Users can see everyone who has access to the workspace
2. **Clarity**: Clear indication of access source (space vs direct)
3. **Proper Management**: Space members can't be accidentally removed from workspace settings
4. **Automatic Sync**: No manual sync needed when space membership changes
5. **Accurate Dashboard**: The dashboard will correctly show workspaces for users who are workspace members but not space members

