# Space Invitations "Permission Denied" - FINAL FIX

## 🔍 Root Cause Identified

The invitations table RLS policies were using the **old** `has_space_role(space_id, 'admin')` function signature, but your database has been migrated to use the **newer** `is_space_admin(space_uuid, user_uuid)` function from migration `032_helper_function_consistency.sql`.

This function signature mismatch causes the RLS policy to fail, resulting in "permission denied."

## ✅ Solution

### Step 1: Apply the Updated Fix

Run this script in Supabase SQL Editor:

**File:** `scripts/fix_invitations_rls_v2.sql`

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Create a **New Query**
3. Copy and paste the contents of `scripts/fix_invitations_rls_v2.sql`
4. Click **Run**

### What This Does

1. ✅ Ensures `is_space_admin()` and `is_space_member()` functions exist
2. ✅ Drops old invitations policies (using old function)
3. ✅ Recreates invitations policies using modern `is_space_admin(space_id, auth.uid())`
4. ✅ Grants proper execution permissions
5. ✅ Verifies all policies are created correctly

### Step 2: Verify Fix Applied

After running the script, you should see output like:

```
NOTICE: Total invitations policies: 4
NOTICE: ✓ Invitations RLS policies have been fixed (v2)
NOTICE: ✓ Using modern is_space_admin() function
NOTICE: ✓ Space admins and owners can now create, update, and delete invitations
```

### Step 3: Test the Fix

1. Log into your app as a **space owner** or **admin**
2. Navigate to: **Space Settings** → **Invitations** tab
3. Enter an email address
4. Select a role (member, admin, viewer)
5. Click "Invite"
6. ✅ **Should work without error!**

## 🧪 Optional: Verify Your Role First

If you want to confirm you're an admin of the space before testing:

```sql
-- Check your spaces and roles
SELECT 
  s.id as space_id,
  s.name as space_name,
  sm.role as your_role,
  p.email as your_email
FROM spaces s
JOIN space_members sm ON s.id = sm.space_id
JOIN profiles p ON p.id = sm.user_id
WHERE sm.user_id = auth.uid()
ORDER BY s.name;
```

You should see `owner` or `admin` in the `your_role` column.

## 📊 Technical Details

### Old (Broken) Policy
```sql
CREATE POLICY "Space admins can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (public.has_space_role(space_id, 'admin'));
```
❌ Problem: `has_space_role` expects enum type, gets text literal

### New (Fixed) Policy
```sql
CREATE POLICY "Space admins can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (public.is_space_admin(space_id, auth.uid()));
```
✅ Uses modern function with correct signature (uuid, uuid)

## 🗂️ Files

- ✅ `scripts/fix_invitations_rls_v2.sql` - The complete fix (use this one!)
- ℹ️ `scripts/fix_invitations_rls.sql` - Old version (superseded by v2)
- ℹ️ `scripts/verify_space_role.sql` - Diagnostic queries
- ℹ️ `scripts/diagnose_invitations_rls.sql` - More diagnostics

## ❓ Troubleshooting

### Still Getting Permission Denied?

1. **Check you're an admin:**
   ```sql
   SELECT public.is_space_admin('YOUR-SPACE-ID'::uuid, auth.uid());
   ```
   Should return `true`

2. **Check the policies exist:**
   ```sql
   SELECT policyname FROM pg_policies WHERE tablename = 'invitations';
   ```
   Should show 4 policies

3. **Check the function exists:**
   ```sql
   SELECT proname, pg_get_function_identity_arguments(oid) 
   FROM pg_proc 
   WHERE proname = 'is_space_admin';
   ```
   Should show `is_space_admin(space_uuid uuid, user_uuid uuid)`

### Need More Help?

Run the full diagnostic:
```bash
psql [your-connection] -f scripts/diagnose_invitations_rls.sql
```

## 🎯 Summary

- **Problem:** Function signature mismatch in RLS policies
- **Fix:** Update policies to use `is_space_admin(uuid, uuid)`
- **Time:** < 1 second to apply
- **Risk:** Low - only updates invitations policies
- **Testing:** Try inviting a member after applying

---

**Ready to fix?** Just run `scripts/fix_invitations_rls_v2.sql` in Supabase SQL Editor!

