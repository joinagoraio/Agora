# Database Migration Strategy

## Overview

This document describes the database migration strategy for Agora, including how to create, test, and deploy migrations safely.

---

## Migration Files

All migration files are located in the `scripts/` directory and follow the naming convention:

```
XXX_description.sql
```

Where `XXX` is a sequential number (e.g., `010`, `011`, `012`).

---

## Creating Migrations

### 1. Create Migration File

```sql
-- scripts/028_add_new_feature.sql

-- Description: Add new feature table
-- Created: 2024-01-01
-- Author: Developer Name

-- Create new table
CREATE TABLE IF NOT EXISTS public.new_feature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_new_feature_name 
  ON public.new_feature(name);

-- Add RLS policies
ALTER TABLE public.new_feature ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own features"
  ON public.new_feature
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add comments
COMMENT ON TABLE public.new_feature IS 'New feature table';
```

### 2. Make Migrations Idempotent

Always use `IF NOT EXISTS` and `IF EXISTS` to make migrations safe to run multiple times:

```sql
-- Good: Idempotent
CREATE TABLE IF NOT EXISTS public.new_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON public.new_table(name);

-- Bad: Not idempotent
CREATE TABLE public.new_table (...);
CREATE INDEX idx_name ON public.new_table(name);
```

### 3. Test Locally First

1. Run migration in local Supabase instance
2. Verify tables/indexes created
3. Test application with new schema
4. Verify rollback works (if needed)

---

## Migration Execution Order

Migrations must be run in sequential order:

1. `010_extend_spaces_schema.sql`
2. `011_extend_workspaces_schema.sql`
3. `012_create_space_items.sql`
4. ... (continue in order)

**Never skip migrations** - Each builds on previous ones.

---

## Running Migrations

### Development

1. Open Supabase SQL Editor
2. Copy migration SQL
3. Run in SQL Editor
4. Verify success

### Staging

1. Test migration in staging first
2. Run in Supabase SQL Editor (staging project)
3. Verify application works
4. Monitor for issues

### Production

1. **Backup database first**
2. Run migration in Supabase SQL Editor (production)
3. Monitor application
4. Verify no errors
5. Document completion

---

## Rollback Strategy

### Creating Rollback Scripts

For critical migrations, create rollback scripts:

```sql
-- scripts/028_add_new_feature_rollback.sql

-- Rollback: Remove new feature table
DROP TABLE IF EXISTS public.new_feature CASCADE;
```

### Rollback Procedure

1. **Stop application** (if possible)
2. Run rollback script
3. Verify database state
4. Restart application
5. Monitor for issues

### When to Rollback

- Migration causes errors
- Application breaks
- Data corruption detected
- Performance degradation

---

## Best Practices

### 1. Always Backup First

```bash
# Export database before migration
pg_dump -h your-db.supabase.co -U postgres -d postgres > backup.sql
```

### 2. Test in Staging

- Always test migrations in staging first
- Verify application works
- Check performance impact

### 3. Make Migrations Small

- One logical change per migration
- Easier to test and rollback
- Clearer history

### 4. Document Changes

- Include description in migration file
- Document breaking changes
- Note required application updates

### 5. Use Transactions

Supabase runs migrations in transactions automatically, but be aware:
- Large migrations may timeout
- Some operations can't be rolled back (e.g., DROP)

---

## Migration Checklist

Before running a migration:

- [ ] Migration tested locally
- [ ] Migration tested in staging
- [ ] Backup created (production)
- [ ] Rollback script prepared
- [ ] Application code updated (if needed)
- [ ] Team notified
- [ ] Maintenance window scheduled (if needed)

After running a migration:

- [ ] Migration completed successfully
- [ ] Application works correctly
- [ ] No errors in logs
- [ ] Performance acceptable
- [ ] Rollback script verified (if needed)

---

## Common Migration Patterns

### Adding a Table

```sql
CREATE TABLE IF NOT EXISTS public.new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_new_table_column 
  ON public.new_table(column_name);

ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;
```

### Adding a Column

```sql
ALTER TABLE public.existing_table
  ADD COLUMN IF NOT EXISTS new_column TEXT;
```

### Modifying a Column

```sql
-- Add default value
ALTER TABLE public.existing_table
  ALTER COLUMN column_name SET DEFAULT 'default_value';

-- Change type (be careful with data)
ALTER TABLE public.existing_table
  ALTER COLUMN column_name TYPE NEW_TYPE USING column_name::NEW_TYPE;
```

### Adding an Index

```sql
CREATE INDEX IF NOT EXISTS idx_table_column 
  ON public.table_name(column_name);
```

### Adding RLS Policy

```sql
CREATE POLICY "policy_name"
  ON public.table_name
  FOR SELECT
  USING (condition);
```

---

## Troubleshooting

### Migration Fails

1. Check error message
2. Verify SQL syntax
3. Check for conflicts (existing objects)
4. Review dependencies
5. Test in isolation

### Application Breaks After Migration

1. Check application logs
2. Verify schema matches code
3. Check for missing columns/indexes
4. Review RLS policies
5. Consider rollback

### Performance Issues

1. Check new indexes created
2. Verify query plans
3. Check for missing indexes
4. Review table statistics

---

## Migration History

Keep track of migrations:

| Version | Migration | Date | Description | Status |
|---------|-----------|------|-------------|--------|
| 0.1.0 | 010-027 | 2024-01-01 | Initial migrations | ✅ Complete |
| 0.2.0 | 028+ | TBD | Future migrations | ⏳ Pending |

---

## Resources

- [Supabase Migrations](https://supabase.com/docs/guides/database/migrations)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)

---

For more information, see:
- [Deployment Guide](./DEPLOYMENT.md)
- [Developer Guide](./DEVELOPER.md)

