# Quick Fix: Space Document Upload Sync Error

## TL;DR

You're getting an error when uploading documents to a space with workspaces because RLS policies are blocking the sync.

**Fix it in 2 steps:**

### 1. Apply the RLS Fix

```bash
# Get your database URL from Supabase dashboard
export DATABASE_URL="your_database_url_here"

# Apply the fix
psql $DATABASE_URL -f scripts/fix_scope_document_sync_rls.sql
```

### 2. Test It

```bash
# Start dev server
npm run dev

# Upload a document to a space that has workspaces
# Watch the logs - should see: "Successfully synced to all workspaces"
```

## If Documents Are Already Missing

Manually sync them:

```bash
curl -X POST http://localhost:3000/api/admin/sync-inherited-documents
```

## Verify It Worked

```bash
psql $DATABASE_URL -f scripts/diagnose_upload_sync_issue.sql
```

Look at section 4 "Missing Syncs" - should be empty.

## What Changed?

- ✅ Added RLS policies to allow `service_role` to sync documents
- ✅ Enhanced logging so you can see exactly what's happening
- ✅ Created diagnostic tools to troubleshoot
- ✅ Created admin API for manual sync

## More Details?

See `SPACE_DOCUMENT_SYNC_FIX_SUMMARY.md` for the full explanation.

