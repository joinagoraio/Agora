# Fix: Sources Table Missing Error

## Problem
You're getting the error: "Could not find the table 'public.sources' in the schema cache"

## Solution
The `sources` table needs to be created in your Supabase database. I've created a migration script that will handle this automatically.

## Steps to Fix

### Option 1: Using Supabase Dashboard (Recommended)

1. Open your Supabase project dashboard
2. Go to the **SQL Editor** section
3. Open the file `scripts/ensure_sources_table.sql` from this project
4. Copy the entire contents
5. Paste it into the SQL Editor
6. Click **Run** to execute the script

The script will:
- Create the `sources` table if it doesn't exist
- Or migrate from `connectors` to `sources` if needed
- Set up proper RLS (Row Level Security) policies
- Update all foreign key references

### Option 2: Using Supabase CLI

If you have the Supabase CLI installed and configured:

```bash
# Navigate to project root
cd /Users/korz/Code/Projects/agora

# Run the migration
supabase db execute --file scripts/ensure_sources_table.sql
```

### Option 3: Using psql directly

If you have direct database access:

```bash
psql <your-database-connection-string> -f scripts/ensure_sources_table.sql
```

## Verification

After running the script, you should see output messages like:
- ✓ Table "sources" exists
- ✓ Column "source_id" exists in documents table
- ✓ Type "source_type" exists
- ✓ RLS policies are configured

## What This Fixes

This migration ensures that:
1. The `sources` table exists with the correct schema
2. Source types include: google_drive, notion, confluence, sharepoint, dropbox, direct_upload, overheid_nl, workspace_generated
3. Proper RLS policies are in place for workspace members
4. Foreign key relationships are correctly set up
5. Indexes are created for performance

## After Running the Script

Once the script is executed successfully, you should be able to:
- Add Google Drive sources
- Add other external sources (Notion, Overheid.nl, etc.)
- Manage sources in the workspace

## Need Help?

If you encounter any errors while running the script, please share the error message and I can help troubleshoot.

