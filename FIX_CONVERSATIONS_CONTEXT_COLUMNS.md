# Fix: Conversations Table Issues

## Problem

When trying to start a new chat, you get one of these errors:

```
Could not find the 'context_id' column of 'conversations' in the schema cache
```

or

```
permission denied for table conversations
```

## Root Causes

1. **Missing columns**: The `context_id` and `context_type` columns don't exist in the conversations table
2. **Missing permissions**: The `authenticated` role doesn't have INSERT/SELECT grants on the conversations table

## Solution

Run the comprehensive fix script that handles both issues.

### Steps (Recommended)

1. **Open Supabase SQL Editor**
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - **Important**: The SQL editor runs as the `postgres` superuser

2. **Run the comprehensive fix**
   - Open the file: **`scripts/fix_conversations_table_grants.sql`** ⭐ (NEW - Use this one!)
   - Copy the entire SQL script
   - Paste it into the Supabase SQL Editor
   - Click "Run"

3. **Verify the fix**
   - You should see success messages like:
     - `✓ Table-level permissions granted successfully`
     - `✓ authenticated role can INSERT into conversations`
     - `✅ CONVERSATIONS TABLE FIX COMPLETE`
   - The script will also show the current table structure and permissions

4. **Test the application**
   - Try starting a new chat
   - The error should be resolved!

### Alternative: Simpler Scripts

If the comprehensive fix has issues, try these alternatives:

#### Option 1: Column-only fix
Use `scripts/fix_conversations_context_columns_simple.sql` - just adds columns without permission grants

#### Option 2: Manual commands
Run these in the SQL Editor one at a time:

```sql
-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

-- Add columns
ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS context_type text DEFAULT 'workspace';
ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS context_id uuid;

-- Create index
CREATE INDEX IF NOT EXISTS conversations_workspace_context_idx 
  ON public.conversations (workspace_id, context_type, context_id);
```

### Troubleshooting

#### Still Getting Permission Denied?

1. **Check you're in the SQL Editor** (not running via API or psql)
2. **Verify you're the project owner** in Supabase
3. **Check RLS is enabled**: Run `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'conversations';`
4. **Check existing policies**: The script handles this, but policies may be blocking inserts

## What the Comprehensive Fix Does

The script (`fix_conversations_table_grants.sql`) fixes everything:
1. ✅ **Grants table permissions** to `authenticated` role (INSERT, SELECT, UPDATE, DELETE)
2. ✅ **Adds missing columns** (`context_type` and `context_id`) if they don't exist
3. ✅ **Grants execute permissions** on helper functions used by RLS policies
4. ✅ **Creates indexes** for better query performance
5. ✅ **Updates existing data** to have default values
6. ✅ **Verifies everything** and shows you the results

## Rollback (If Needed)

If you need to rollback this migration:

```sql
-- Rollback script
ALTER TABLE public.conversations DROP COLUMN IF EXISTS context_id;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS context_type;
DROP INDEX IF EXISTS conversations_workspace_context_idx;
```

## Context

These columns enable context-scoped conversations:
- `context_type`: Defines where the conversation is happening (e.g., 'workspace', 'space')
- `context_id`: References the specific context (e.g., space_id if context_type='space')

This allows conversations to be scoped to different parts of the application, enabling features like space-specific chats.

