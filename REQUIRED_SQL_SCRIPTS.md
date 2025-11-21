# Required SQL Scripts to Run

## Summary

You need to run **2 SQL scripts** to fix both issues:

1. ✅ **Member Permissions** → `scripts/update_member_permissions.sql`
2. ✅ **Workspace Invitations** → `scripts/fix_workspace_invitations_complete.sql`

---

## Script 1: Member Permissions Fix

**File:** `scripts/update_member_permissions.sql`

**What it fixes:**
- Members can now access and manage workspaces (same as admin)
- Members still CANNOT access Settings (only owner/admin)
- Updates RLS functions `is_workspace_member()` and `is_workspace_admin()`

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `scripts/update_member_permissions.sql`
3. Paste and click "Run"

**Expected output:**
```
CREATE OR REPLACE FUNCTION (2 times)
GRANT (2 times)
```

---

## Script 2: Workspace Invitations Fix

**File:** `scripts/fix_workspace_invitations_complete.sql`

**What it fixes:**
- Workspace invitation flow (email pre-filled, password confirmation)
- Invitation status tracking (pending → accepted)
- Users appear in Members list after acceptance
- Accepted invitations disappear from Invitations tab
- Workspaces appear in dashboard after invitation acceptance
- Anonymous users can view invitation pages

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `scripts/fix_workspace_invitations_complete.sql`
3. Paste and click "Run"

**Expected output:**
```
✓ accepted_at column already exists (or added)
✓ Granted EXECUTE permissions on helper functions
✓ Granted table permissions
✓ Dropped all old workspace_invitations policies
✓ Created 4 new workspace_invitations policies
✓ Created public workspace viewing policy
✓ Created workspace_members viewing policy
✓ Verification passed: All policies created correctly
```

---

## Running Order

**Run in this order:**

1. **First:** `update_member_permissions.sql`
2. **Second:** `fix_workspace_invitations_complete.sql`

(Order doesn't strictly matter, but this is logical)

---

## After Running Scripts

### Test Member Permissions:

1. Log in as a space member (not owner/admin)
2. Verify you CAN:
   - See workspaces in the space
   - Create new workspaces
   - Upload documents
   - Create notes
   - Edit workspace settings
   - Save messages as evidence
3. Verify you CANNOT:
   - See "Settings" in space dropdown menu (⋮ icon still visible)

### Test Workspace Invitations:

1. Send a workspace invitation
2. Open invitation link (logged out)
3. Verify invitation page shows:
   - Workspace name
   - Pre-filled email (disabled)
   - Password field
   - Password confirmation field (on signup)
4. Create account or sign in
5. Verify you are redirected to workspace
6. Check workspace settings:
   - You appear in Members tab ✅
   - Invitation is NOT in Invitations tab ✅
7. Check dashboard:
   - Workspace appears in "My Workspaces" ✅

---

## Troubleshooting

### Script 1 Errors:

**"function already exists"**
- Safe to ignore, it's using `CREATE OR REPLACE`

**"permission denied"**
- Make sure you're running as database owner/superuser
- In Supabase dashboard, you should have proper permissions by default

### Script 2 Errors:

**"syntax error at or near 'RAISE'"**
- Make sure you copied the ENTIRE script
- Don't copy from the `.md` documentation file

**"policy already exists"**
- The script drops policies first, so this shouldn't happen
- If it does, the script will still work

**"column accepted_at already exists"**
- Safe to ignore, script checks for this

---

## Verification

After running both scripts, verify:

```sql
-- Check is_workspace_member function includes members
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'is_workspace_member';

-- Check workspace_invitations has accepted_at
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'workspace_invitations' 
AND column_name = 'accepted_at';

-- Check workspace_invitations policies
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'workspace_invitations';
```

Expected results:
- `is_workspace_member` definition includes `has_space_role(workspaces.space_id, 'member')`
- `accepted_at` column exists with type `timestamp with time zone`
- 4 policies on `workspace_invitations` (SELECT, INSERT, UPDATE, DELETE)

---

## Summary Checklist

- [ ] Run `scripts/update_member_permissions.sql`
- [ ] Run `scripts/fix_workspace_invitations_complete.sql`
- [ ] Test member permissions (can access workspace settings)
- [ ] Test member restrictions (cannot access space Settings)
- [ ] Test workspace invitation flow (email pre-filled, auto-accept)
- [ ] Verify accepted users appear in Members list
- [ ] Verify accepted invitations disappear from Invitations list
- [ ] Verify workspaces appear in dashboard

---

## Files Reference

**Member Permissions:**
- SQL Script: `scripts/update_member_permissions.sql`
- Documentation: `SPACE_MEMBER_PERMISSIONS_UPDATE.md`

**Workspace Invitations:**
- SQL Script: `scripts/fix_workspace_invitations_complete.sql`
- Documentation: `WORKSPACE_INVITATION_COMPLETE_FIX.md`
- Quick Guide: `scripts/RUN_THIS_SQL.txt`

---

🎉 **After running both scripts, all issues should be resolved!**

