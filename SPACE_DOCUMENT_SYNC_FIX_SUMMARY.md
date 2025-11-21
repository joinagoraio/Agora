# Space Document Upload Sync Issue - Fix Summary

## Problem Identified

When uploading documents to a space that has linked workspaces, you're getting the error:
> "Document uploaded, but we could not sync it to linked workspaces. Try re-linking the space or contact support if it keeps failing."

### Root Cause

The issue is caused by **RLS (Row Level Security) policies** that were tightened during security audits. Specifically:

1. Scripts like `031_critical_rls_fixes.sql` and `fix_vulnerable_policies.sql` dropped the permissive "System can manage documents" policy
2. They replaced it with user-based policies that check `auth.uid()`
3. When the admin client (using `service_role`) tries to insert inherited documents, `auth.uid()` is NULL
4. The RLS policies reject the insert because there's no authenticated user

This happens **only when workspaces exist** because:
- When there are **no workspaces**: The sync function returns early without trying to insert anything (no error)
- When there **are workspaces**: The sync function tries to insert documents but RLS blocks it (error!)

## What I've Done

### 1. Enhanced Logging (`lib/services/scope-documents.ts`)

Added comprehensive logging to help diagnose the issue:

**In `syncScopeDocumentToAllWorkspaces`:**
- Logs the sync request with classification and visibility
- Shows how many workspaces were found (direct + linked)
- Logs each workspace sync attempt
- Shows detailed error information if sync fails

**In `upsertWorkspaceDocumentForScope`:**
- Logs each step of the document creation process
- Shows whether updating existing or creating new
- Logs detailed error information including PostgreSQL error codes

Now when you upload a document, you'll see clear logs like:
```
[ScopeDocuments] Sync request: { spaceId, spaceItemId, classification: 'public', visibility: 'internal' }
[ScopeDocuments] Found workspaces to sync: { totalUniqueWorkspaces: 2, workspaceIds: [...] }
[ScopeDocuments] Syncing to workspace abc123...
[ScopeDocuments] Failed to create workspace document from scope: { errorCode: '42501', errorMessage: 'permission denied' }
```

### 2. RLS Fix Script (`scripts/fix_scope_document_sync_rls.sql`)

Created a SQL script that adds explicit policies for `service_role` to:
- **INSERT** and **UPDATE** documents (for syncing space documents to workspaces)
- **INSERT** and **SELECT** sources (for creating "workspace_generated" sources)
- **Manage** document_pages (for storing document content)

This allows the admin client to bypass the user-based RLS policies when syncing documents.

### 3. Diagnostic SQL (`scripts/diagnose_upload_sync_issue.sql`)

Created a comprehensive diagnostic script that shows:
1. Recent space documents and whether they should sync
2. Which workspaces should receive synced documents
3. Which inherited documents were actually created
4. Missing syncs (should exist but don't)
5. Source status for each workspace
6. RLS policies on the documents table

### 4. Admin API Endpoint (`app/api/admin/sync-inherited-documents/route.ts`)

Created an admin API for manual syncing:

**GET** (dry run):
```bash
curl http://localhost:3000/api/admin/sync-inherited-documents
```
Shows what would be synced without actually doing it.

**POST** (actually sync):
```bash
# Sync all workspaces
curl -X POST http://localhost:3000/api/admin/sync-inherited-documents

# Sync specific workspace
curl -X POST http://localhost:3000/api/admin/sync-inherited-documents \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "xxx", "space_id": "yyy"}'
```

### 5. Testing Guide (`SPACE_DOCUMENT_SYNC_TESTING.md`)

Comprehensive guide explaining:
- Expected behavior
- How to diagnose issues
- Common problems and solutions
- Code flow explanation
- Database table structure

## How to Fix Your Environment

### Step 1: Apply the RLS Fix

Run the SQL fix script on your database:

```bash
# Set your database URL
export DATABASE_URL="your_supabase_database_url"

# Apply the fix
psql $DATABASE_URL -f scripts/fix_scope_document_sync_rls.sql
```

This will add policies that allow `service_role` to manage documents and sources.

### Step 2: Test the Upload

1. Start your dev server:
```bash
npm run dev
```

2. Upload a document to a space that has workspaces

3. Watch the terminal logs for `[ScopeDocuments]` messages

4. You should see:
   - ✅ "Successfully synced to workspace X" for each workspace
   - ✅ "Successfully synced to all workspaces" at the end

### Step 3: Verify with Diagnostic

Run the diagnostic to confirm documents were synced:

```bash
psql $DATABASE_URL -f scripts/diagnose_upload_sync_issue.sql
```

Look at section 4 "Missing Syncs" - it should be empty if everything worked.

### Step 4: Backfill Existing Documents (Optional)

If you have documents that were uploaded before the fix, sync them manually:

**Option A: Via API**
```bash
curl -X POST http://localhost:3000/api/admin/sync-inherited-documents
```

**Option B: Via SQL**

The sync happens automatically when you run the fix script for existing public documents.

## Understanding the Flow

### Upload Process

```
User uploads file to space
    ↓
File saved to Supabase Storage
    ↓
Space item created (classification="public" by default for documents)
    ↓
shouldSyncSpaceDocument() → true (because classification is public)
    ↓
syncScopeDocumentToAllWorkspaces()
    ↓
Fetch workspaces (direct + linked)
    ↓
For each workspace:
    - Ensure "workspace_generated" source exists
    - Create/update document with metadata.origin="space_scope"
    - Create/update document_pages with content
    ↓
Success or Error
```

### Key Design Points

1. **Documents are public by default**: The `resolveSpaceItemClassification` function always returns "public" for documents
2. **Sync happens for public or visible documents**: Either `classification="public"` OR `visibility="public"`
3. **Admin client is used**: The sync uses `service_role` to bypass user permissions
4. **Idempotent**: Re-running sync is safe - it updates existing documents rather than duplicating

## Verification Checklist

After applying the fix, verify:

- [ ] RLS policies show `service_role` in the roles list
- [ ] Document upload shows success message (no warnings)
- [ ] Logs show "Successfully synced to all workspaces"
- [ ] Diagnostic SQL shows no missing syncs
- [ ] Documents appear in workspace views
- [ ] Documents have `metadata.origin="space_scope"`

## Troubleshooting

### If you still see the error after applying the fix:

1. **Check if the SQL script was applied**:
```sql
SELECT policyname, roles::text
FROM pg_policies
WHERE tablename = 'documents'
  AND policyname LIKE '%service_role%';
```
Should show policies for service_role.

2. **Check the detailed logs**: The enhanced logging will show exactly where it's failing

3. **Run the diagnostic**: `scripts/diagnose_upload_sync_issue.sql` will pinpoint the issue

4. **Check for other RLS issues**: Run `scripts/fix_workspace_creation_rls.sql` if there are workspace-related issues

### If documents are still missing:

Use the manual sync API:
```bash
curl -X POST http://localhost:3000/api/admin/sync-inherited-documents
```

## Files Changed

1. **lib/services/scope-documents.ts** - Added comprehensive logging
2. **scripts/fix_scope_document_sync_rls.sql** - RLS policy fix (NEW)
3. **scripts/diagnose_upload_sync_issue.sql** - Diagnostic script (NEW)
4. **app/api/admin/sync-inherited-documents/route.ts** - Admin API (NEW)
5. **SPACE_DOCUMENT_SYNC_TESTING.md** - Testing guide (NEW)
6. **SPACE_DOCUMENT_SYNC_FIX_SUMMARY.md** - This summary (NEW)

## Next Steps

1. Apply the RLS fix SQL script
2. Test document upload
3. Verify with diagnostic
4. Backfill existing documents if needed
5. Monitor logs for any other issues

The enhanced logging will make it much easier to diagnose any future issues!

