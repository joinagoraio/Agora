# Markdown Document Rendering Fix - FINAL

## Problem
The multi-format document viewer was experiencing "Failed to fetch" errors when loading markdown documents, with CORS errors blocking the requests.

## Root Causes

### 1. **Incorrect Metadata Types** (Primary Issue)
Markdown files uploaded to Supabase Storage were being assigned `application/octet-stream` as their content type instead of `text/markdown`. Example from logs:

```json
{
  "documentTitle": "The End of Digital Fragmentation",
  "metadata": {
    "type": "application/octet-stream",  // ❌ Should be text/markdown
    "origin": "space_scope"
  },
  "url": "...1763806008571_q7upmqqztmf.md"  // ✅ It's clearly a .md file
}
```

This caused:
- `isTextDocument` to evaluate to `false`
- Documents not being routed through the text-content API
- Direct fetches to Supabase Storage with `credentials: 'include'`
- **CORS errors**: Supabase Storage's wildcard CORS policy (`*`) doesn't work with credentials mode `include`

### 2. **Word Document Misclassification**
Word documents (`.doc`, `.docx`) were being incorrectly classified as "text" documents, causing:
- Routing to text-content API instead of Word viewer
- Failure to use Mammoth HTML conversion

### 3. **Insufficient Detection Logic**
The document type detection relied too heavily on metadata type checking and didn't prioritize:
- File extensions (most reliable indicator)
- Document origin (`space_scope`, `workspace_generated`)

## The Solution

### Key Principle: **File Extension First**

Updated the document type detection across all components to:
1. **Check file extension FIRST** (`.md`, `.txt`, `.markdown`)
2. Check metadata type as secondary indicator
3. Check document origin for workspace/space-generated content
4. Explicitly exclude Word documents

### Implementation

```typescript
// NEW: Robust detection logic
const hasTextExtension = 
  documentTitle?.toLowerCase().endsWith(".md") ||
  documentTitle?.toLowerCase().endsWith(".txt") ||
  documentTitle?.toLowerCase().endsWith(".markdown")

const metadataType = typeof documentMetadata?.type === "string" 
  ? documentMetadata.type.toLowerCase() 
  : ""
const hasTextType = metadataType.includes("text") || metadataType.includes("markdown")

const origin = typeof documentMetadata?.origin === "string" 
  ? documentMetadata.origin.toLowerCase() 
  : ""
const isWorkspaceText = origin === "workspace_generated" || origin === "space_scope"

const isWordDocument = 
  metadataType.includes("word") ||
  metadataType.includes("msword") ||
  documentTitle?.toLowerCase().endsWith(".doc") ||
  documentTitle?.toLowerCase().endsWith(".docx")

// A document is text if: (extension OR type OR origin) AND NOT word
const isTextDocument = (hasTextExtension || hasTextType || isWorkspaceText) && !isWordDocument
```

## Files Modified

### 1. **`components/multi-format-viewer.tsx`**
- Added SSR guard
- Added documentId validation
- **Fixed document type detection** to prioritize file extension
- Added comprehensive logging
- Improved error handling with detailed context

### 2. **`components/document-viewer-client.tsx`**
- **Fixed `isTextDocument` logic** to check extension first
- Respects `space_scope` and `workspace_generated` origins
- Added debug logging for URL computation

### 3. **`app/workspaces/[workspaceId]/documents/[documentId]/page.tsx`**
- **Fixed text document detection** for highlighting logic
- Prioritizes file extension over metadata

### 4. **`app/api/documents/[documentId]/text-content/route.ts`**
- **Updated endpoint validation** to accept files based on extension
- Respects `space_scope` origin even with wrong metadata
- Updated `fetchDocumentTextFromSource` helper function

## Document Type Routing (After Fix)

| Document Type | Detection | API Endpoint | Rendering |
|--------------|-----------|--------------|-----------|
| **Markdown** (`.md`) | Extension **→** Type → Origin | `/api/documents/{id}/text-content` | Plain text |
| **Plain Text** (`.txt`) | Extension **→** Type → Origin | `/api/documents/{id}/text-content` | Plain text |
| **Space Documents** | Origin `space_scope` | `/api/documents/{id}/text-content` | Plain text |
| **Workspace Docs** | Origin `workspace_generated` | `/api/documents/{id}/text-content` | Plain text |
| **Word** (`.doc`, `.docx`) | Extension → Type (explicitly excluded from text) | Original URL | Mammoth → HTML |
| **PDF** (`.pdf`) | Extension → Type | `/api/documents/{id}/pdf` | PDF.js |

## Before vs After

### Before (Broken)
```
1. File: "document.md" with type "application/octet-stream"
2. isTextDocument checks metadata type → FALSE (no "text" or "markdown")
3. Uses direct Supabase URL with credentials: 'include'
4. CORS Error: Wildcard (*) not allowed with credentials
5. Failed to fetch ❌
```

### After (Fixed)
```
1. File: "document.md" with type "application/octet-stream"
2. isTextDocument checks extension FIRST → TRUE (.md extension)
3. Routes to /api/documents/{id}/text-content
4. API fetches from document_pages or Supabase (server-side, no CORS)
5. Returns plain text content ✅
6. Viewer renders markdown successfully ✅
```

## Key Insights

1. **File extensions are more reliable than MIME types** for text documents
   - Supabase Storage may assign generic `application/octet-stream` types
   - File extensions don't change after upload

2. **Document origin matters**
   - `space_scope` and `workspace_generated` documents are always text-based
   - Should be routed through text-content API regardless of metadata

3. **CORS restrictions matter**
   - Supabase Storage has wildcard CORS: `Access-Control-Allow-Origin: *`
   - This doesn't work with `credentials: 'include'`
   - Solution: Use server-side proxy (text-content API)

## Testing Done

✅ Markdown files (`.md`) with correct metadata
✅ Markdown files (`.md`) with `application/octet-stream` metadata
✅ Space-scoped documents with wrong metadata
✅ Plain text files (`.txt`)
✅ Word documents still use Mammoth conversion
✅ PDFs still work correctly

## Logging Added

The fix includes comprehensive logging to help diagnose future issues:

```
[DocumentViewerClient] Computing viewerUrl
[DocumentViewerClient] Using text-content URL
[MultiFormatViewer] Starting document load
[MultiFormatViewer] Document type detection
  - hasTextExtension: true/false
  - hasTextType: true/false
  - isWorkspaceText: true/false
  - isWordDocument: true/false
[MultiFormatViewer] Fetching text content
[MultiFormatViewer] Text content fetched successfully
```

## Result

Markdown documents now render correctly regardless of their metadata content type, as long as they have the correct file extension or origin.

