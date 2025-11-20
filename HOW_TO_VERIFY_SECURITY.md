# How to Verify Your Database Security

This guide explains how to verify that your Agora database has all security policies correctly configured.

---

## Quick Start

### Step 1: Run the Verification Script

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `scripts/verify_security_policies.sql`
4. Click **Run** (or press F5)

### Step 2: Review the Results

The script will output 10 sections checking different aspects of security:

#### ✅ What You Want to See:

```
1. RLS ENABLED CHECK
   ✅ ENABLED on all critical tables

2. CRITICAL: DOCUMENTS TABLE POLICIES
   ✅ SECURE - "Workspace members can insert documents"
   ✅ SECURE - "Workspace admins can update documents"

3. CRITICAL: MESSAGES TABLE POLICIES
   ✅ SECURE - "Workspace members can insert messages"

4. CRITICAL: PROFILES TABLE POLICIES
   ✅ SECURE - "Users can view connected profiles"

SUMMARY:
   ✅ SECURE - No vulnerable policies detected
   Your database is properly secured!
```

#### ❌ What You DON'T Want to See:

```
2. CRITICAL: DOCUMENTS TABLE POLICIES
   ❌ VULNERABLE - "System can insert documents" (qual = 'true')
   ❌ VULNERABLE - "System can update documents" (qual = 'true')

SUMMARY:
   ❌ CRITICAL - Multiple vulnerable policies detected
   Run the remediation script to fix vulnerable policies
```

---

## Understanding the Error You Got

When you tried to run a script and got:

```
ERROR: 42710: policy "Workspace members can insert documents" for table "documents" already exists
```

This means:

### ✅ **Good News!**
Your database **already has the secure policies** in place. This error occurs when trying to create a policy that already exists.

### What to Do:

**Option A: Verify Everything is Secure** (Recommended)
Run `verify_security_policies.sql` to confirm all policies are correct.

**Option B: If You Need to Re-apply Policies**
1. First backup your database
2. Run `fix_vulnerable_policies.sql` which includes `DROP POLICY IF EXISTS` statements
3. This will safely remove and recreate all policies

---

## Interpreting Results

### Section 1: RLS Enabled Check
- **✅ ENABLED** = Good! Table is protected
- **❌ DISABLED** = CRITICAL! Table is completely unprotected

### Section 2-7: Policy Checks
Each section checks a specific table:

**Status Meanings:**
- **✅ SECURE** = Policy correctly restricts access
- **❌ VULNERABLE** = Policy allows unrestricted access (must fix!)
- **⚠️ REVIEW NEEDED** = Policy may need manual review

**Common Vulnerable Patterns:**
- Policy named "System can..." with `true` condition
- Policy named "Public ... viewable by everyone"
- Workspace invitations SELECT with `qual = 'true'`

### Section 8: Helper Functions
Checks that authorization helper functions exist and use `SECURITY DEFINER`:

**Required Functions:**
- `is_space_member(space_uuid, user_uuid)`
- `is_space_admin(space_uuid, user_uuid)`
- `is_workspace_member(workspace_uuid, user_uuid)`
- `is_workspace_admin(workspace_uuid, user_uuid)`

### Section 9: Vulnerable Policy Detection
**Critical Section!** This scans for any policies with overly permissive conditions.

**If this section shows results:**
```
❌ VULNERABLE - Policy allows all authenticated users
```
You MUST run the remediation script.

### Section 10: Storage Policies
Checks that your Supabase Storage bucket has workspace-scoped policies.

**What's Good:**
- ✅ "Workspace members can read/upload documents"

**What's Bad:**
- ❌ "Public can read documents"
- ❌ "Anyone can upload"

---

## If Vulnerabilities are Found

### Step 1: Backup Your Database

**In Supabase Dashboard:**
1. Go to **Database** → **Backups**
2. Create a manual backup
3. Wait for confirmation

### Step 2: Run the Remediation Script

1. Open `scripts/fix_vulnerable_policies.sql` in SQL Editor
2. Review the script (it shows exactly what it will do)
3. Click **Run**

The script will:
- Drop vulnerable policies
- Create secure replacement policies
- Verify helper functions exist
- Generate a success/failure report

### Step 3: Verify Again

Run `verify_security_policies.sql` again to confirm all issues are resolved.

---

## Regular Security Audits

### Recommended Schedule:

**Weekly** (during development):
- Run `verify_security_policies.sql`
- Check for any new vulnerabilities

**Monthly** (in production):
- Full security verification
- Review user access patterns
- Check for unauthorized access attempts

**After any database changes:**
- Always run verification
- Especially after running migrations
- After adding new tables

---

## Troubleshooting

### "Policy already exists" Error

**Cause:** You're trying to create a policy that already exists.

**Solution:**
- This is usually good! It means the secure policy is already there.
- Run `verify_security_policies.sql` to confirm.
- If you need to recreate it, use `fix_vulnerable_policies.sql` which includes `DROP POLICY IF EXISTS`.

### "Helper function does not exist" Warning

**Cause:** Required security functions are missing.

**Solution:**
```sql
-- You need to run earlier migration scripts that create these functions
-- Look for scripts that contain:
CREATE OR REPLACE FUNCTION is_workspace_member(...)
CREATE OR REPLACE FUNCTION is_workspace_admin(...)
```

### "RLS is disabled" Error

**Cause:** Table is not protected by RLS.

**Solution:**
```sql
ALTER TABLE tablename ENABLE ROW LEVEL SECURITY;
```

Then run the remediation script to add policies.

---

## Quick Reference: What Each Policy Should Do

### Documents Table
- **INSERT**: Only workspace members can add documents
- **UPDATE**: Only workspace admins can modify documents
- **SELECT**: Only workspace members can view documents
- **DELETE**: Only workspace admins can delete documents

### Messages Table
- **INSERT**: Only users in the conversation's workspace can post
- **SELECT**: Only conversation participants can read

### Profiles Table
- **SELECT**: Users can see their own profile + profiles of people in their spaces
- **UPDATE**: Users can only update their own profile

### Workspace Invitations
- **SELECT**: Only workspace admins OR the invited person (by email match)
- **INSERT**: Only workspace admins can create invitations

### Storage (documents bucket)
- **SELECT**: Only workspace members can download
- **INSERT**: Only workspace members can upload
- **DELETE**: Only workspace admins can delete

---

## Need Help?

If the verification script shows issues you don't understand:

1. Check the `PRODUCTION_READY_CHECKLIST.md` for context
2. Review the detailed audit reports in the repository
3. Run the remediation script (with backup!)
4. If still unclear, review the RLS policies in Supabase Dashboard:
   - Go to **Database** → **Policies**
   - Click on each table to see its policies

---

## Example: Ideal Verification Output

```sql
=== AGORA SECURITY POLICY VERIFICATION ===

1. RLS ENABLED CHECK
   spaces              | ✅ ENABLED
   workspaces          | ✅ ENABLED
   documents           | ✅ ENABLED
   messages            | ✅ ENABLED
   profiles            | ✅ ENABLED

2. CRITICAL: DOCUMENTS TABLE POLICIES
   Workspace members can insert documents  | ✅ SECURE
   Workspace admins can update documents   | ✅ SECURE

3. CRITICAL: MESSAGES TABLE POLICIES
   Workspace members can insert messages   | ✅ SECURE

4. CRITICAL: PROFILES TABLE POLICIES
   Users can view connected profiles       | ✅ SECURE

8. HELPER FUNCTIONS CHECK
   is_space_member      | ✅ SECURITY DEFINER | ✅ EXISTS
   is_workspace_member  | ✅ SECURITY DEFINER | ✅ EXISTS
   is_workspace_admin   | ✅ SECURITY DEFINER | ✅ EXISTS

9. VULNERABLE POLICY DETECTION
   (no rows - this is good!)

=== SUMMARY ===
   vulnerable_policies: 0
   total_policies: 47
   overall_status: ✅ SECURE - No vulnerable policies detected
   recommendation: Your database is properly secured!
```

This is what you want to see! ✅

---

**Remember:** Security is not a one-time task. Run these checks regularly!
