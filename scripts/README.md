# Database Migration Scripts

This directory contains all database migration scripts for the Agora platform.

## ⚠️ IMPORTANT: Migration Strategy

### For New Deployments

**Run migrations sequentially** in numerical order:

```bash
000_initial_setup.sql
001_xxx.sql
002_xxx.sql
...
032_helper_function_consistency.sql
```

This ensures all security patches and schema updates are properly applied.

### complete_migration.sql

**DO NOT USE** `complete_migration.sql` for new deployments!

This file is **outdated** and does not include critical security fixes from:
- `031_critical_rls_fixes.sql` - RLS policy hardening
- `032_helper_function_consistency.sql` - Helper function updates

If you have already run `complete_migration.sql`, **immediately apply**:
1. `scripts/031_critical_rls_fixes.sql`
2. `scripts/032_helper_function_consistency.sql`

---

## Migration Files

### Critical Security Fixes

**031_critical_rls_fixes.sql** ⚠️ **CRITICAL**
- Fixes overly permissive RLS policies
- Prevents cross-workspace data access
- Restricts profile visibility
- Hardens storage access controls
- **Must be applied** to any database

**032_helper_function_consistency.sql** ⚠️ **IMPORTANT**
- Consolidates helper function signatures
- Ensures consistent authorization checks
- Removes duplicate function definitions

### Core Schema

- **000-010**: Initial database setup, RLS, triggers
- **011-020**: User roles, workspace features
- **021-030**: Workspace memberships, invitations

### Security Verification & Remediation

**verify_security_policies.sql** 🔍 **NEW**
- Comprehensive security policy verification
- Checks all RLS policies for vulnerabilities
- Verifies helper functions
- Generates security score
- **Run this regularly** to ensure your database is secure

**fix_vulnerable_policies.sql** 🛠️ **NEW**
- Automated remediation script
- Fixes vulnerable RLS policies
- Only run if verify script shows issues
- **Requires database backup** before running

### Other Files

- **storage_rls_policies.sql**: Supabase Storage bucket policies
- **fix_sources_rls_policies.sql**: Sources table RLS fixes

---

## Running Migrations

### Supabase Dashboard

1. Go to your project's SQL Editor
2. Copy the contents of each migration file
3. Execute in order (000 → 001 → ... → 032)

### Local Development

If using a local Supabase instance:

```bash
supabase db reset  # Reset to clean state
# Then run each migration via SQL Editor or CLI
```

---

## Security Notes

### RLS Policies

All tables use Row-Level Security (RLS) to enforce access control at the database level. The RLS policies ensure:

- Users can only access spaces they're members of
- Workspace isolation is enforced
- Document access requires workspace membership
- Profile data is only visible to connected users

### Helper Functions

Security helper functions use `SECURITY DEFINER` to avoid RLS recursion issues. These functions include:

- `is_space_member(space_uuid, user_uuid)`
- `is_space_admin(space_uuid, user_uuid)`
- `is_workspace_member(workspace_uuid, user_uuid)`
- `is_workspace_admin(workspace_uuid, user_uuid)`

### Storage Policies

Storage bucket policies in `storage_rls_policies.sql` enforce:

- Workspace-scoped document uploads
- Membership-based download access
- Path-based isolation

---

## Troubleshooting

### "Policy already exists" errors

These are safe to ignore if you're re-running migrations. The scripts use `DROP POLICY IF EXISTS` where possible.

### "Function already exists" errors

Some older migration files may not have `OR REPLACE`. You can safely drop the function first:

```sql
DROP FUNCTION IF EXISTS function_name CASCADE;
```

Then re-run the migration.

### "Extension does not exist" errors

Make sure you have the required extensions enabled in Supabase:
- `uuid-ossp`
- `pgcrypto`
- `vector` (for document embeddings)

---

## Adding New Migrations

When adding a new migration:

1. **Create a numbered file**: `033_your_migration_name.sql`
2. **Include idempotency checks**: Use `IF NOT EXISTS` and `DROP ... IF EXISTS`
3. **Document the changes**: Add comments explaining what the migration does
4. **Test thoroughly**: Test on a development database first
5. **Update this README**: Add your migration to the list above

### Migration Template

```sql
-- 033_your_feature_name.sql
-- Description: Brief description of what this migration does
-- Date: YYYY-MM-DD

-- Your migration code here
-- Include rollback instructions as comments if applicable
```

---

## Migration History

| File | Date | Description | Critical |
|------|------|-------------|----------|
| 031 | 2025-11-20 | RLS security hardening | ⚠️ YES |
| 032 | 2025-11-20 | Helper function consistency | ⚠️ YES |

---

## Questions?

For issues with migrations, check:
1. Supabase project logs
2. SQL error messages
3. RLS policy conflicts

**Never skip migrations** - always run them in sequential order!
