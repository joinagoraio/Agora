# Quick Fix: Workspace Comments Loading Error

## The Error
```
[workspace-comments] Failed to load comments: {}
```

## Quick Fix (2 commands)

```bash
# 1. Diagnose (optional but recommended)
psql $DATABASE_URL -f scripts/diagnose_workspace_comments_rls.sql

# 2. Apply Fix
psql $DATABASE_URL -f scripts/fix_workspace_comments_rls.sql
```

## What This Fixes

- Missing/incorrect RLS policies on `workspace_comments` table
- Inconsistent `is_space_member` helper function signatures
- Missing UPDATE policy for workspace comments

## Expected Result

After running the fix, you should see:
- ✅ No console errors when loading workspace pages
- ✅ Comments load properly in the Evidence tab
- ✅ 4 RLS policies active on workspace_comments table

## See Full Details

For more information, see `WORKSPACE_COMMENTS_RLS_FIX_GUIDE.md`

