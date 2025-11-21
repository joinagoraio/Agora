# Workspace Comments Loading Fix

## Problem
When attempting to delete a space, users encountered an error when navigating to or refreshing workspace pages:
```
[workspace-comments] Failed to load comments: {}
```

This occurred because the RLS (Row Level Security) policy for `workspace_comments` would fail silently when:
1. The parent space was deleted (triggering CASCADE deletion of workspaces)
2. The user lost access to the space
3. There was a timing issue during space/workspace deletion

## Root Cause

The RLS policy for `workspace_comments` checks:
```sql
EXISTS (
  SELECT 1 FROM workspaces w
  WHERE w.id = workspace_comments.workspace_id
  AND is_space_member(w.space_id, auth.uid())
)
```

When a space is deleted:
- Workspaces are CASCADE deleted (due to `ON DELETE CASCADE` foreign key)
- But if a user navigates to a workspace page during/after deletion, the query fails
- The error object returned is empty `{}` due to how RLS failures are reported

## Solution

### 1. Enhanced Workspace Page Error Handling
**File**: `app/workspaces/[workspaceId]/page.tsx`

Added robust error handling for both `workspace_comments` and `workspace_notes` queries:

- **For comments**: If loading fails, we now check:
  1. Does the workspace still exist?
  2. Does the parent space still exist?
  3. If either is missing → redirect to dashboard
  4. If both exist but comments failed → continue with empty comments

- **For notes**: Added similar graceful degradation with logging

### 2. Improved Space Deletion Function
**File**: `lib/actions/space.ts`

Enhanced the `deleteSpace` function to:
- Verify the user is the space owner before attempting deletion
- Provide clear error messages if verification fails
- Add detailed logging for debugging

## Changes Made

### app/workspaces/[workspaceId]/page.tsx
```typescript
// Before: Just logged the error and continued
if (commentsError) {
  console.error("[workspace-comments] Failed to load comments:", commentsError)
}

// After: Check if workspace/space still exists and handle appropriately
if (commentsError) {
  console.error("[workspace-comments] Failed to load comments:", commentsError)
  
  // Check if workspace still exists
  const { data: workspaceCheck } = await supabase
    .from("workspaces")
    .select("id, space_id")
    .eq("id", workspaceId)
    .single()
  
  if (!workspaceCheck) {
    console.error("[workspace-comments] Workspace no longer exists, redirecting to dashboard")
    redirect("/dashboard")
  }

  // Verify space still exists
  const { data: spaceCheck } = await supabase
    .from("spaces")
    .select("id")
    .eq("id", workspaceCheck.space_id)
    .single()
  
  if (!spaceCheck) {
    console.error("[workspace-comments] Parent space was deleted, redirecting to dashboard")
    redirect("/dashboard")
  }

  console.warn("[workspace-comments] Comments failed to load but workspace exists - continuing with empty comments")
}
```

### lib/actions/space.ts
```typescript
// Before: Direct deletion without verification
export async function deleteSpace(spaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }
  
  const { error } = await supabase.from("spaces").delete().eq("id", spaceId)
  if (error) return { error: error.message }
  
  revalidatePath("/dashboard")
  return { success: true }
}

// After: Verify ownership before deletion
export async function deleteSpace(spaceId: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  // Verify user is the owner
  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("owner_id")
    .eq("id", spaceId)
    .single()

  if (spaceError || !space) {
    return { error: "Space not found or you don't have access to it" }
  }

  if (space.owner_id !== user.id) {
    return { error: "Only the space owner can delete this space" }
  }

  // Proceed with deletion
  const { error } = await supabase.from("spaces").delete().eq("id", spaceId)
  if (error) {
    console.error("[deleteSpace] Error deleting space:", error)
    return { error: error.message || "Failed to delete space. Please try again." }
  }

  revalidatePath("/dashboard")
  return { success: true }
}
```

## Testing

To verify the fix works:

1. **Test successful space deletion**:
   ```bash
   # As space owner
   # 1. Navigate to space settings
   # 2. Click "Delete Space"
   # 3. Confirm deletion
   # Expected: Redirects to dashboard, no console errors
   ```

2. **Test workspace page resilience**:
   ```bash
   # 1. Open a workspace page
   # 2. Delete the parent space in another tab
   # 3. Refresh the workspace page
   # Expected: Redirects to dashboard gracefully
   ```

3. **Test non-owner deletion attempt**:
   ```bash
   # As non-owner space member
   # 1. Try to delete space via API or function
   # Expected: Clear error message "Only the space owner can delete this space"
   ```

## Database Schema Reference

Relevant cascade behaviors:
```sql
-- Workspaces CASCADE when space is deleted
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  ...
);

-- Workspace comments CASCADE when workspace is deleted
CREATE TABLE workspace_comments (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ...
);
```

## Future Improvements

1. **Enhanced RLS Error Reporting**: Consider adding a custom error handler that provides more context when RLS policies fail
2. **Soft Deletion**: Implement soft delete for spaces to allow recovery
3. **Background Cleanup**: Add a cleanup job to handle orphaned data if CASCADE fails
4. **User Notifications**: Show a toast notification when a workspace's parent space is deleted while viewing it

## Related Files
- `app/workspaces/[workspaceId]/page.tsx` - Workspace page component
- `lib/actions/space.ts` - Space management functions
- `scripts/017_update_rls_for_new_tables.sql` - RLS policies for collaboration tables
- `scripts/fix_workspace_creation_rls.sql` - Recent RLS fixes

## Notes
- The empty error object `{}` is a known behavior of Supabase when RLS policies fail
- CASCADE deletion should handle cleanup automatically, but timing issues can occur
- The fix ensures graceful degradation in all scenarios

