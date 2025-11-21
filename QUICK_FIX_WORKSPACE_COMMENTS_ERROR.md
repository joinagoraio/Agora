# Quick Fix: Workspace Comments Error

## The Error

```
[workspace-comments] Failed to load comments: {}
```

## The Cause

RLS policies don't support workspace-only members (users invited directly to workspaces).

## The Fix (30 seconds)

### Step 1: Set your database URL

```bash
# Find this in Supabase Dashboard → Project Settings → Database → Connection string
export DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"
```

### Step 2: Run the fix

```bash
./scripts/apply_workspace_rls_fix.sh
```

### Step 3: Refresh your browser

Press `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)

## What Gets Fixed

✅ **workspace_comments** - Comments now load correctly  
✅ **workspace_notes** - Notes now load correctly  
✅ **workspace_activity** - Activity logs now load correctly  
✅ **workspace_items** - Evidence items now load correctly

## Verify It Worked

1. Open browser console (F12)
2. Navigate to any workspace page
3. Error should be gone!
4. Check the "Notes" and "Evidence" tabs - everything should load

## Alternative: Manual Fix

If you prefer to run SQL directly:

```bash
psql $DATABASE_URL -f scripts/fix_workspace_collaboration_rls.sql
```

## Rollback (if needed)

The old policies can be restored, but workspace-only members will lose access.

## Need Help?

See `WORKSPACE_COLLABORATION_RLS_FIX.md` for detailed documentation.


