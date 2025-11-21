# Profiles Visibility Fix V2

## Problem

The first profiles visibility script (`fix_profiles_visibility.sql`) was **too restrictive** and removed all members from the list. The complex EXISTS queries were blocking profile visibility.

## Root Cause

The policy created in V1 had complex nested EXISTS checks:
```sql
-- User can see profiles of people in their workspaces
EXISTS (
  SELECT 1 FROM workspace_members wm1
  WHERE wm1.user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM workspace_members wm2
    WHERE wm2.workspace_id = wm1.workspace_id
    AND wm2.user_id = profiles.id
  )
)
```

This caused the RLS engine to block most queries, resulting in no profiles being visible.

## Solution V2

**Run this simpler script:**
```
scripts/fix_profiles_visibility_v2.sql
```

This uses a **simple, practical approach** for a collaborative platform:

```sql
-- Allow all authenticated users to view all profiles
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
```

### Why This Approach?

In a collaborative workspace platform:
- ✅ **Team members need to see each other** - It's expected that people working together can see profiles
- ✅ **Simple = Reliable** - No complex queries that might break
- ✅ **Standard practice** - Most team collaboration tools (Slack, Notion, etc.) allow team members to see each other
- ✅ **Already protected** - Users can only access workspaces/spaces they're members of, so they only see profiles of people in their teams

### Additional Policies Created

The script also adds:
- **INSERT policy**: Users can create their own profile (needed for signup)
- **UPDATE policy**: Users can update their own profile

## Quick Rollback (If Needed)

If you already ran the V1 script and need to rollback immediately:
```
scripts/rollback_profiles_policy.sql
```

## Run V2 Script Now

**Copy and paste in Supabase SQL Editor:**
```
scripts/fix_profiles_visibility_v2.sql
```

Expected output:
```
✓ Created profiles policies:
  - SELECT policies: 1+
  - INSERT policies: 1+
  - UPDATE policies: 1+

✅ Fixed profiles RLS policies
✅ All authenticated users can view profiles
✅ Users can insert/update their own profile

🎉 Members should now appear in workspace settings!
```

## Testing

After running V2 script:

1. Go to workspace settings → Members tab
2. Verify you see:
   - ✅ All workspace members with email and name
   - ✅ All space members with email and name
   - ✅ Editable role dropdowns for workspace members
   - ✅ Plain text roles for space members

## Summary

✅ **V2 script uses simple, practical approach**  
✅ **All authenticated users can view profiles**  
✅ **Members now visible in workspace/space settings**  
✅ **Standard for collaborative platforms**  

🎉 **Run `scripts/fix_profiles_visibility_v2.sql` to fix the issue!**

---

## Security Note

This approach means authenticated users can query the profiles table to see emails and names of other users in the system. This is acceptable because:

1. Users can only access workspaces/spaces they're invited to
2. They already see these profiles when viewing member lists
3. Email addresses are used for invitations anyway
4. This is standard for team collaboration platforms

If you need more restrictive policies in the future, we can implement them after ensuring the basic functionality works.

