# Complete Fix for Google Drive Integration

## Problem
When trying to add a Google Drive source, you encountered multiple schema issues:
1. "Could not find the table 'public.sources' in the schema cache"
2. "permission denied for table sources"
3. "Could not find the 'classification' column of 'documents' in the schema cache"

## Solution: Run These Scripts in Order

Execute these SQL scripts in your Supabase SQL Editor **in this exact order**:

### Step 1: Create Sources Table
**File:** `scripts/ensure_sources_table.sql`

This will:
- ✅ Create the `sources` table (or migrate from `connectors` if it exists)
- ✅ Set up source types: google_drive, notion, overheid_nl, etc.
- ✅ Add necessary enum values

Expected output:
```
✓ Table "sources" exists
✓ Column "source_id" exists in documents table
✓ Type "source_type" exists
```

### Step 2: Fix Sources Permissions
**File:** `scripts/fix_sources_permissions.sql`

This will:
- ✅ Grant permissions to authenticated users
- ✅ Set up RLS policies for workspace members
- ✅ Verify policy configuration

Expected output:
```
✓ All RLS policies are configured (4 policies found)
✓ Table "sources" exists
✓ Permissions granted to authenticated users
```

### Step 3: Fix Documents Schema
**File:** `scripts/fix_documents_schema.sql`

This will:
- ✅ Add missing columns: `classification`, `tenant_id`, `url`, etc.
- ✅ Fix document_status enum to support both old and new values
- ✅ Add proper CHECK constraints and indexes
- ✅ Grant necessary permissions

Expected output:
```
✓ Column "classification" exists in documents table
✓ Column "tenant_id" exists in documents table
✓ Column "url" exists in documents table
✓ All required columns exist in documents table
✓ Classification constraint is configured
```

## How to Run

### Using Supabase Dashboard (Recommended)

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. For each script above (in order):
   - Open the script file from your project
   - Copy the entire contents
   - Paste into the SQL Editor
   - Click **Run**
   - Wait for success messages
   - Move to the next script

### Using Supabase CLI

If you have the Supabase CLI configured:

```bash
cd /Users/korz/Code/Projects/agora

# Run in order
supabase db execute --file scripts/ensure_sources_table.sql
supabase db execute --file scripts/fix_sources_permissions.sql
supabase db execute --file scripts/fix_documents_schema.sql
```

### Using psql

If you have direct database access:

```bash
cd /Users/korz/Code/Projects/agora

# Run in order
psql <connection-string> -f scripts/ensure_sources_table.sql
psql <connection-string> -f scripts/fix_sources_permissions.sql
psql <connection-string> -f scripts/fix_documents_schema.sql
```

## After Running All Scripts

You should now be able to:
- ✅ Add Google Drive sources to your workspace
- ✅ Add documents from Google Drive
- ✅ Set classification levels (public, internal, confidential)
- ✅ Add other external sources (Overheid.nl, Notion, etc.)

## Verification

To verify everything is working:

1. Go to your workspace
2. Click "Manage Sources" or "Add Source"
3. Select "Google Drive"
4. Complete the Google Drive authentication
5. Create the source
6. Browse and add documents from Google Drive

You should no longer see any schema-related errors!

## Troubleshooting

### If you still get errors:

1. **Check the Supabase logs** in your dashboard under "Logs" → "Postgres Logs"
2. **Verify tables exist**: Run this in SQL Editor:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('sources', 'documents');
   ```

3. **Check for missing columns**: Run this in SQL Editor:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'documents' 
   AND column_name IN ('classification', 'tenant_id', 'url', 'status');
   ```

4. **Verify permissions**: Run this in SQL Editor:
   ```sql
   SELECT grantee, privilege_type 
   FROM information_schema.role_table_grants 
   WHERE table_name IN ('sources', 'documents');
   ```

### Common Issues

- **"permission denied"** → Re-run `fix_sources_permissions.sql`
- **"column does not exist"** → Re-run `fix_documents_schema.sql`
- **"type does not exist"** → Re-run `ensure_sources_table.sql`

## Need Help?

If you encounter any errors not covered here, please share:
1. The exact error message
2. Which script you were running
3. Any relevant output from the SQL Editor

I can help troubleshoot and create additional fixes if needed!

