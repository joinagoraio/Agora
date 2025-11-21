# Fix: Workspace & Space Editing Errors

## Problem

When editing workspace or space details, you get an error:
```
Could not find the 'context' column of 'workspaces' in the schema cache
```

## Root Cause

The `workspaces` and `spaces` tables are missing columns that the application tries to update:

### Missing in Workspaces Table:
- `summary` - Brief 1-2 sentence overview (AI-enhanced, similar to mission statement)
- `description` - Detailed 4-6 sentence description (AI-enhanced)
- `context` - Additional context for AI search
- `location` - Location field for searches

### Possibly Missing in Spaces Table:
- `space_type` - Type of space (national, regional, municipal, etc.)
- `jurisdiction` - Jurisdiction information (JSON)
- `visibility` - Visibility level (public, internal, confidential)
- `metadata` - Additional metadata (stores summary, description, timeframe)
- `logo_url` - URL to space logo
- `description` - Space description

## Solution

Run this migration script in **Supabase SQL Editor**:

```bash
scripts/add_missing_columns_workspaces_spaces.sql
```

### How to Apply

#### Option 1: Using Supabase Dashboard
1. Open your Supabase project
2. Go to **SQL Editor** (left sidebar)
3. Click **New query**
4. Copy the contents of `scripts/add_missing_columns_workspaces_spaces.sql`
5. Paste into the editor
6. Click **Run**

#### Option 2: Using psql
```bash
psql $DATABASE_URL -f scripts/add_missing_columns_workspaces_spaces.sql
```

## Expected Output

You should see:
```
================================================================
✅ MISSING COLUMNS ADDED
================================================================

📋 Workspaces table columns:
   ✓ context, description, location

📋 Spaces table columns:
   ✓ description, jurisdiction, logo_url, metadata, space_type, visibility

✅ You can now edit workspace and space details without errors!
```

## After Running the Script

1. **Refresh your browser** (Cmd+Shift+R or Ctrl+Shift+R)
2. **Try editing workspace details again**:
   - Name
   - **Summary** (brief 1-2 sentences) - **AI-enhanced**
   - **Description** (detailed 4-6 sentences) - **AI-enhanced**
   - Context (for AI search)
   - Location
3. **Try editing space details again**:
   - Name
   - Type
   - **Summary/Mission Statement** (1-2 sentences) - **AI-enhanced**
   - **Description** (4-6 sentences) - **AI-enhanced**
   - Timeframe

Everything should now save without errors! ✅

## AI Enhancement Feature

Both **workspaces** and **spaces** now support AI-enhanced text fields:

### Workspaces:
- **Summary**: Brief 1-2 sentence overview of the workspace
- **Description**: Detailed 4-6 sentence description

### Spaces:
- **Summary/Mission Statement**: Concise 1-2 sentence mission
- **Description**: Comprehensive 4-6 sentence description

The AI enhancement helps:
- ✅ Improve clarity and conciseness
- ✅ Maintain original meaning
- ✅ Use professional language
- ✅ Provide appropriate detail level for each field type

## What the Script Does

### For Workspaces:
- ✅ Adds `summary` column (TEXT) - Brief overview
- ✅ Adds `context` column (TEXT) - AI search context
- ✅ Adds `location` column (TEXT) - Workspace location
- ✅ Adds helpful comments explaining what each column is for
- ✅ Ensures `description` column exists (should be from base schema)

### For Spaces:
- ✅ Creates `space_type` enum if needed
- ✅ Creates `visibility_type` enum if needed
- ✅ Adds all missing columns with appropriate defaults
- ✅ Creates indexes for performance
- ✅ Adds helpful comments

## Files Modified

- ✅ Created: `scripts/add_missing_columns_workspaces_spaces.sql`
- ✅ Created: `FIX_WORKSPACE_SPACE_EDITING.md` (this file)

## Related Migrations

These are the original migration scripts that should have been run:
- `scripts/add_workspace_properties.sql` (partial - workspaces only)
- `scripts/010_extend_spaces_schema.sql` (spaces extended schema)
- `scripts/011_extend_workspaces_schema.sql` (workspaces extended schema)

The new comprehensive script combines and ensures all necessary columns exist.

## Safety

This script:
- ✅ Uses `ADD COLUMN IF NOT EXISTS` - safe to run multiple times
- ✅ Won't affect existing data
- ✅ Only adds missing columns
- ✅ Uses sensible defaults
- ✅ Wrapped in a transaction (will rollback if any error)

## Troubleshooting

### If the script fails:
1. Check the error message
2. Verify you have database permissions
3. Check if the tables exist: `SELECT * FROM workspaces LIMIT 1;`

### If editing still fails after running the script:
1. Hard refresh browser (Cmd+Shift+R)
2. Check browser console for the actual error
3. Verify the columns were added:
   ```sql
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'workspaces';
   ```

## Status

- ✅ Script created
- ⏳ Awaiting application to database
- ⏳ Awaiting verification

Run the script and let me know if workspace/space editing works! 🚀

