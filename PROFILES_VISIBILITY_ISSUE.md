# Profiles Visibility Issue - Fix

## Problem

Workspace-only members don't show email or name in the Members tab because the `profiles` table RLS policies are blocking the query.

## Root Cause

When you query:
```typescript
const { data: workspaceMembers } = await supabase
  .from("workspace_members")
  .select("*, profiles(*)")
  .eq("workspace_id", workspaceId)
```

The query does TWO RLS checks:
1. ✅ `workspace_members` RLS - Passes (we can see workspace members)
2. ❌ `profiles` RLS - **Fails** (profiles of workspace members are blocked)

Even though the workspace_members query succeeds, the nested `profiles(*)` query is blocked by the profiles table's RLS policies.

## Solution

**Run the SQL script:**
```
scripts/fix_profiles_visibility.sql
```

This script:
1. ✅ Grants SELECT permission on profiles to authenticated/anon
2. ✅ Drops old conflicting profile policies
3. ✅ Creates a comprehensive "Users can view profiles" policy that allows viewing profiles of:
   - Your own profile
   - People in your spaces
   - People in your workspaces ⭐ (fixes the issue!)
   - People who invited you

## The Key Policy

```sql
CREATE POLICY "Users can view profiles"
  ON public.profiles
  FOR SELECT
  USING (
    -- User can see their own profile
    id = auth.uid()
    OR
    -- User can see profiles of people in their workspaces ⭐
    EXISTS (
      SELECT 1 FROM workspace_members wm1
      WHERE wm1.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM workspace_members wm2
        WHERE wm2.workspace_id = wm1.workspace_id
        AND wm2.user_id = profiles.id
      )
    )
    -- ... other conditions
  );
```

This allows workspace members to see each other's profiles when querying workspace_members.

## Testing

After running the script:

1. Go to workspace settings → Members tab
2. Verify workspace-only members now show:
   - ✅ Email
   - ✅ Full name
   - ✅ Role dropdown

## Alternative Quick Fix

If the comprehensive policy is too complex, you can use this simpler (but less secure) version:

```sql
-- Quick fix: Allow viewing all profiles (less secure)
CREATE POLICY "Users can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (true);  -- ⚠️ Warning: Allows viewing any profile
```

This is less secure but will definitely work. The recommended script uses workspace/space scoping for better security.

## Files

- **SQL Script**: `scripts/fix_profiles_visibility.sql`
- **Documentation**: This file
- **Server Page**: `app/workspaces/[workspaceId]/settings/page.tsx` (added debug logging)

## Summary

✅ **Run `scripts/fix_profiles_visibility.sql` to fix the issue**  
✅ **Profiles will be visible to workspace members**  
✅ **Email and name will display in Members tab**  

🎉 **This is the final piece needed for workspace-only members to work correctly!**

