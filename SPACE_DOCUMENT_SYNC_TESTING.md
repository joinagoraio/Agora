# Space Document Sync Testing Guide

## Issue Description

When uploading documents to a space, you're seeing an error:
> "Document uploaded, but we could not sync it to linked workspaces. Try re-linking the space or contact support if it keeps failing."

This happens when there are workspaces linked to the space, but NOT when the space has no workspaces yet.

## Expected Behavior

When you upload a document to a space with `classification="public"`:
1. The document is saved to the `space_items` table
2. The system finds all workspaces linked to that space (either `workspace.space_id` matches OR linked via `workspace_space_links`)
3. For each workspace, it creates an inherited document in the `documents` table with:
   - `metadata.origin = 'space_scope'`
   - `metadata.sourceSpaceItemId = <space_item.id>`
   - A `source_id` pointing to a "workspace_generated" source
4. The document appears in all linked workspaces automatically

## Testing Steps

### Step 1: Run the Diagnostic SQL

First, let's see what's happening in your database:

```bash
# Make sure your database URL is set
export DATABASE_URL="your_database_url_here"

# Run the diagnostic
psql $DATABASE_URL -f scripts/diagnose_upload_sync_issue.sql
```

This will show you:
- Recent space documents and their classification
- Which workspaces should receive them
- Which inherited documents were actually created
- Missing syncs
- Source status for each workspace
- RLS policies that might be blocking

### Step 2: Check Server Logs

With the new enhanced logging, you'll see detailed output when uploading:

1. Start your dev server:
```bash
npm run dev
```

2. Upload a document to a space with existing workspaces

3. Watch the terminal output for lines starting with:
   - `[ScopeDocuments]` - Shows all sync activity
   - `[SpaceItems]` - Shows the publish action

Look for:
- ✅ **Success indicators**: "Successfully synced to all workspaces", "Successfully synced to workspace X"
- ❌ **Failure indicators**: "Failed to sync", "upsert returned false", error details

### Step 3: Analyze Common Issues

#### Issue A: Missing "workspace_generated" Source

**Symptom**: Logs show "Failed to ensure workspace source"

**Cause**: The workspace doesn't have a `source` record with `type='workspace_generated'`

**Fix**: The code should create this automatically, but if RLS is blocking it:

```sql
-- Check if sources table has RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'sources';

-- Check INSERT policies on sources
SELECT policyname, cmd, roles::text
FROM pg_policies
WHERE tablename = 'sources' AND cmd IN ('INSERT', 'ALL');
```

The `service_role` should be able to INSERT. If not, run:

```sql
-- Allow service_role to insert sources
CREATE POLICY IF NOT EXISTS "Service role can manage sources"
ON sources
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

#### Issue B: RLS Blocking Document Insert

**Symptom**: Logs show "Failed to create workspace document from scope" with a permissions error

**Cause**: RLS policies on `documents` table are blocking the admin client

**Fix**: Check and fix RLS:

```sql
-- Check if service_role can insert documents
SELECT policyname, cmd, roles::text, with_check
FROM pg_policies
WHERE tablename = 'documents' AND cmd IN ('INSERT', 'ALL');
```

Make sure there's a policy like:

```sql
CREATE POLICY IF NOT EXISTS "Service role can manage documents"
ON documents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

#### Issue C: Workspace Not Found

**Symptom**: Logs show "Failed to fetch workspace for scope document"

**Cause**: The workspace might have been deleted or the workspace ID is invalid

**Fix**: Run the diagnostic SQL to verify workspaces exist and are linked properly.

#### Issue D: Document Insert Constraint Violation

**Symptom**: Error code like `23503` (foreign key violation) or `23505` (unique constraint)

**Possible causes**:
- The `source_id` doesn't exist (foreign key violation)
- The `external_id` already exists (unique constraint)
- The `tenant_id` is invalid

**Fix**: Check the error details in the logs. The enhanced logging will show:
- `errorCode`: The PostgreSQL error code
- `errorDetails`: Additional details about what constraint failed
- `errorHint`: PostgreSQL's suggestion

### Step 4: Manual Sync for Existing Documents

If you have documents that were uploaded but didn't sync, you can manually sync them:

**Option 1: Via API**

```bash
# Trigger manual sync for all workspaces
curl -X POST http://localhost:3000/api/admin/sync-inherited-documents
```

**Option 2: Via SQL**

```sql
-- Find all public space documents
SELECT id, space_id, payload->>'title' as title
FROM space_items
WHERE item_type = 'document'
  AND (classification = 'public' OR visibility = 'public');

-- For each document, check if it's synced to all workspaces
-- (Use the diagnostic SQL from Step 1)
```

Then in your application code, you can call the sync function programmatically.

### Step 5: Verify the Fix

After identifying and fixing the issue:

1. Upload a new document to a space with workspaces
2. Check the logs - you should see "Successfully synced to all workspaces"
3. Run the diagnostic SQL again - Section 4 should show no "Missing Inherited Documents"
4. In the UI, go to each workspace and verify the document appears

## Understanding the Code Flow

### Upload Flow

```
User uploads file to space
    ↓
app/api/spaces/[spaceId]/documents/upload/route.ts
    ↓
publishSpaceItem(spaceId, { item_type: "document", classification: "public", ... })
    ↓
lib/actions/space-item.ts: publishSpaceItem()
    ↓
Insert into space_items table
    ↓
shouldSyncSpaceDocument() checks if classification or visibility is "public"
    ↓
syncScopeDocumentToAllWorkspaces(spaceId, spaceItem)
    ↓
lib/services/scope-documents.ts: syncScopeDocumentToAllWorkspaces()
    ↓
Fetch all workspaces (direct + linked)
    ↓
For each workspace:
    upsertWorkspaceDocumentForScope(spaceId, workspaceId, spaceItem)
    ↓
    Check if document already exists
    ↓
    If not, ensure workspace has "workspace_generated" source
    ↓
    Insert into documents table with metadata.origin = "space_scope"
    ↓
    Insert/update document_pages with content
    ↓
    Return true if successful, false otherwise
    ↓
If any workspace fails, throw error
    ↓
publishSpaceItem catches error and adds warning message
```

### Classification Logic

From `lib/utils/space-items.ts`:

```typescript
// Documents are ALWAYS public by default
function resolveSpaceItemClassification(itemType, providedClassification) {
  if (itemType === "document") {
    return "public"
  }
  return "internal"
}

// A document should sync if classification OR visibility is public
function shouldSyncSpaceDocument(itemType, classification, visibility) {
  if (itemType !== "document") return false
  
  const normalizedClassification = classification ?? "public"
  const normalizedVisibility = visibility ?? "internal"
  
  return normalizedClassification === "public" || normalizedVisibility === "public"
}
```

## Key Database Tables

- **`space_items`**: Stores the document uploaded to the space
  - `item_type = 'document'`
  - `classification = 'public' | 'internal' | 'confidential'`
  - `visibility = 'public' | 'internal' | 'confidential'`
  - `payload = { title, file_name, file_url, mime_type, summary, full_text }`

- **`workspaces`**: Workspaces that can belong to a space
  - `space_id`: Direct link to a space

- **`workspace_space_links`**: Additional links between workspaces and spaces
  - Many-to-many relationship

- **`documents`**: Actual documents in workspaces
  - Can be uploaded directly to workspace OR inherited from space
  - `metadata.origin = 'space_scope'`: Indicates this is inherited from a space
  - `metadata.sourceSpaceItemId`: The space_items.id it came from
  - `metadata.sourceSpaceId`: The space.id it came from
  - `source_id`: Points to a "workspace_generated" source

- **`sources`**: Document sources
  - `type = 'workspace_generated'`: Auto-created source for inherited documents
  - Each workspace should have one

## Next Steps After Testing

Once you've identified the issue:

1. **If it's an RLS issue**: Apply the necessary policy fixes
2. **If it's a missing source issue**: The code should handle this, but check the logs
3. **If it's a data integrity issue**: Clean up the data and retry
4. **If it's a bug in the code**: Let me know what the logs show and I can help fix it

The enhanced logging should give us enough information to pinpoint exactly where the sync is failing!

