# Manual Sync Fix for Space Documents

## The Problem
When you upload a document to a space, it should sync to all linked workspaces. If you see the warning:
> "Document uploaded, but we could not sync it to linked workspaces."

This means the sync failed.

## Solutions

### Option 1: Use the Admin API (Recommended)

1. **Start your dev server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Trigger a manual sync** for all workspaces:
   ```bash
   curl -X POST http://localhost:3000/api/admin/sync-inherited-documents
   ```

   This will:
   - Find all workspaces
   - Sync documents from their parent spaces
   - Return a summary of what was synced

3. **Check the status** before syncing:
   ```bash
   curl http://localhost:3000/api/admin/sync-inherited-documents
   ```

### Option 2: Run the SQL Diagnostic

```bash
psql YOUR_DATABASE_URL -f scripts/quick-diagnose-sync.sql
```

This will show:
- The most recent space document
- Whether the space has any workspaces
- Whether inherited documents were created

### Option 3: Check Server Logs

Look at your terminal where `npm run dev` is running. Search for lines containing:
- `[ScopeDocuments]` - Shows sync activity and errors
- `Failed to sync` - Indicates specific failures

## Common Issues and Fixes

### Issue 1: No workspaces linked to the space

**Symptom**: The diagnostic shows 0 workspaces for your space.

**Fix**: Create a workspace in that space or link an existing workspace:
1. Go to the space page
2. Create a new workspace, OR
3. Link an existing workspace to the space

### Issue 2: RLS Policies Blocking Sync

**Symptom**: Server logs show "Failed to create workspace document from scope" with a permissions error.

**Fix**: Check your RLS policies:
```bash
psql YOUR_DATABASE_URL -f scripts/verify_security_policies.sql
```

Look for the `documents` table INSERT policies. The admin client should be able to insert documents.

### Issue 3: Document Classification Not Public

**Symptom**: Document was uploaded but has `classification='internal'` or `visibility='internal'`.

**Fix**: Only documents with `classification='public'` OR `visibility='public'` are synced to workspaces. When uploading, make sure to set the classification to "public" in the form.

### Issue 4: Database Constraint Violation

**Symptom**: Server logs show a constraint violation error (e.g., "violates not-null constraint").

**Fix**: This might indicate a schema issue. Check:
```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'documents'
AND is_nullable = 'NO';
```

Make sure all required fields are being set in the sync code.

## Verification

After applying a fix, verify that documents are synced:

1. Go to a workspace that should have inherited documents
2. Look for documents with a badge showing they're inherited from the space
3. Or check programmatically:
   ```bash
   curl http://localhost:3000/api/admin/sync-inherited-documents
   ```

   Look for `workspacesWithMissingDocs: 0` in the response.

## Still Having Issues?

If the problem persists:

1. **Check the console logs** when uploading - they will show the exact error
2. **Run the full diagnostic**:
   ```bash
   psql YOUR_DATABASE_URL -f scripts/diagnose-space-document-sync.sql
   ```
3. **Check RLS policies** are not too restrictive
4. **Verify the space has workspaces** linked to it


