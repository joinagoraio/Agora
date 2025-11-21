# Quick Fix Instructions

## ✅ Script Fixed - Run Again

The error happened because the policy already existed. I've updated the script to drop it first.

---

## Run These 2 Scripts in Order

### 1. Member Permissions (if not done yet)
```
scripts/update_member_permissions.sql
```

### 2. Workspace Invitations (FIXED - run again)
```
scripts/fix_workspace_invitations_complete.sql
```

---

## What I Fixed

**Added this line to the script:**
```sql
DROP POLICY IF EXISTS "Users can view workspace memberships" ON workspace_members;
```

This ensures the policy is dropped before recreating it, even if it already exists.

---

## Run Script 2 Again Now

1. Open Supabase SQL Editor
2. Copy contents of `scripts/fix_workspace_invitations_complete.sql`
3. Paste and click "Run"

The script should now complete successfully! ✅

---

## Expected Output

```
✓ accepted_at column already exists (or added)
✓ Granted EXECUTE permissions on helper functions
✓ Granted table permissions
✓ Dropped all old workspace_invitations policies
✓ Created 4 new workspace_invitations policies
✓ Created public workspace viewing policy
✓ Created workspace_members viewing policy
✓ Verification passed: All policies created correctly

COMMIT
(3 rows showing policies)
✅ COMPLETE!
```

---

## If Still Getting Errors

Run this SQL first to clean up:

```sql
-- Clean up all workspace_members policies
DROP POLICY IF EXISTS "Workspace members can view workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Users can view their own workspace memberships" ON workspace_members;
DROP POLICY IF EXISTS "Users can view workspace memberships" ON workspace_members;

-- Then run the full script again
```

---

🎉 **Ready to test the full invitation flow after this runs successfully!**

