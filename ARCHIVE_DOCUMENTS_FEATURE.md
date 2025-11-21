# Archive Documents Feature

## Overview

A new feature has been added to view and manage archived documents in workspaces. This provides better document lifecycle management without permanently deleting files.

## What's New

### 1. **Show/Hide Archived Documents Toggle**

A new button appears in the documents list header that allows users to toggle between viewing active and archived documents.

**Features:**
- 📊 Shows count of archived documents (e.g., "Show Archived (3)")
- 🔄 Dynamically loads archived documents when toggled
- 💡 Only visible when there are archived documents
- ⚡ Instant switching between views

### 2. **Visual Indicators for Archived Documents**

Archived documents are clearly distinguishable:

- **Badge**: Shows "Archived" badge next to document title
- **Styling**: Muted background and reduced opacity
- **Icon**: Archive icon in the badge for quick recognition

### 3. **Information Banner**

When viewing archived documents, an informational banner appears explaining:
- These documents are hidden from AI search
- They won't appear in chat context
- They are excluded from RAG (Retrieval-Augmented Generation)

### 4. **Easy Restore**

From the document dropdown menu:
- **Archive**: Converts active documents to archived status
- **Unarchive**: Restores archived documents to active status
- Actions are instant and update the view automatically

## How It Works

### User Flow

1. **View Active Documents** (default)
   - Only active documents are shown
   - Archive button in document menu
   - Clean, focused view

2. **Toggle to Archived View**
   - Click "Show Archived (N)" button
   - View changes to show archived documents
   - Information banner appears
   - Documents have "Archived" badge

3. **Restore Documents**
   - Click dropdown menu (⋮) on archived document
   - Select "Unarchive"
   - Document is restored to active status
   - Automatically refreshes the list

4. **Toggle Back to Active View**
   - Click "Hide Archived (N)" button
   - Returns to active documents only

### Technical Implementation

**State Management:**
```typescript
const [showArchived, setShowArchived] = useState(false)
const [documents, setDocuments] = useState(initialDocuments)
const [isLoadingArchived, setIsLoadingArchived] = useState(false)
```

**Fetching Documents:**
```typescript
const fetchDocuments = async (includeArchived: boolean) => {
  const { data } = await getWorkspaceDocuments(workspaceId, includeArchived)
  setDocuments(data)
}
```

**Toggle Function:**
```typescript
const toggleShowArchived = async () => {
  const newShowArchived = !showArchived
  setShowArchived(newShowArchived)
  await fetchDocuments(newShowArchived)
}
```

## UI Components

### Archive Toggle Button

```tsx
<Button
  variant={showArchived ? "default" : "outline"}
  size="sm"
  onClick={toggleShowArchived}
  disabled={isLoadingArchived}
>
  <Archive className="mr-2 h-4 w-4" />
  {showArchived ? `Hide Archived (${archivedCount})` : `Show Archived (${archivedCount})`}
</Button>
```

### Archived Document Card

```tsx
<Card className={`... ${isArchived ? "opacity-70 bg-muted/30" : ""}`}>
  {isArchived && (
    <Badge variant="secondary">
      <Archive className="mr-1 h-3 w-3" />
      Archived
    </Badge>
  )}
</Card>
```

### Information Banner

```tsx
<Card className="bg-muted/50 border-dashed">
  <CardContent>
    <ArchiveX className="h-4 w-4" />
    <span>
      Viewing archived documents. These documents are hidden from AI search 
      and won't appear in chat context.
    </span>
  </CardContent>
</Card>
```

## Benefits

### For Users

1. **Better Organization**: Separate archived from active documents
2. **Clear Status**: Visual indicators show document state
3. **Easy Management**: Quick toggle between views
4. **Non-Destructive**: Archive instead of delete
5. **Reversible**: Easy to restore documents

### For AI Context

1. **Reduced Noise**: AI only sees relevant active documents
2. **Better Results**: More focused search results
3. **Performance**: Faster queries with fewer documents
4. **Context Quality**: Cleaner knowledge base

## Document Status Lifecycle

```
┌─────────┐     Archive      ┌──────────┐
│         │ ────────────────> │          │
│ Active  │                   │ Archived │
│         │ <──────────────── │          │
└─────────┘     Unarchive     └──────────┘
     │                              │
     │ Delete                       │ Delete
     ▼                              ▼
┌─────────┐                    ┌──────────┐
│ Deleted │                    │ Deleted  │
└─────────┘                    └──────────┘
```

### Status Meanings

| Status | Visible in UI | In AI Search | In RAG | Can Restore |
|--------|---------------|--------------|--------|-------------|
| **active** | ✅ Yes | ✅ Yes | ✅ Yes | N/A |
| **archived** | ⚠️ When toggled | ❌ No | ❌ No | ✅ Yes |
| **deleted** | ❌ No | ❌ No | ❌ No | ⚠️ Soft delete |

## Future Enhancements

Potential improvements for future versions:

1. **Bulk Operations**
   - Select multiple documents
   - Archive/unarchive in batch
   - Bulk restore functionality

2. **Archive Analytics**
   - Show archive date
   - Show who archived it
   - Archive reasons/notes

3. **Auto-Archive**
   - Archive documents after X days
   - Archive based on rules
   - Scheduled archiving

4. **Archive Filters**
   - Filter by source type
   - Filter by date archived
   - Filter by size

5. **Export/Import**
   - Export archived documents
   - Bulk import from archive
   - Archive backups

## Code Changes

### Modified Files

1. **`components/documents-list.tsx`**
   - Added state management for archived view
   - Added toggle button
   - Added fetchDocuments function
   - Added visual indicators
   - Added information banner

### API Endpoints Used

- `getWorkspaceDocuments(workspaceId, includeArchived)` - Fetch documents with optional archived
- `archiveDocument(documentId, workspaceId, archive)` - Archive or unarchive a document

### Database

No schema changes required - uses existing `status` column on documents table.

## Testing

To test the feature:

1. **Create test documents**
   ```
   - Upload a few documents to a workspace
   ```

2. **Archive a document**
   ```
   - Click document menu (⋮)
   - Select "Archive"
   - Confirm document disappears
   ```

3. **Toggle archived view**
   ```
   - Click "Show Archived (1)" button
   - Confirm archived document appears with badge
   - Confirm info banner is visible
   ```

4. **Restore document**
   ```
   - Click document menu (⋮) on archived doc
   - Select "Unarchive"
   - Confirm document is restored
   ```

5. **Toggle back**
   ```
   - Click "Hide Archived (0)" button
   - Confirm only active documents show
   ```

## Related Documentation

- [Document Status System](scripts/add_document_status.sql)
- [Archive Documents Explanation](./ARCHIVE_DOCUMENTS_FEATURE.md) ← You are here
- [RAG Search Implementation](lib/rag/search.ts)

## Questions?

If you have questions about this feature or need help implementing similar functionality, please refer to the code comments in `components/documents-list.tsx`.

