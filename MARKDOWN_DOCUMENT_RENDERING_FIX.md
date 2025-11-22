# Markdown Document Rendering Fix

## Problem
The multi-format document viewer was experiencing "Failed to fetch" errors when loading documents, particularly for markdown files. The error was occurring at the browser level before any HTTP response was received.

## Root Cause
Word documents (`.doc`, `.docx`) were being incorrectly classified as "text" documents and routed through the text-content API endpoint. This caused several issues:

1. **Incorrect routing**: Word documents were sent to `/api/documents/{id}/text-content` instead of being processed with the Word viewer
2. **Format mismatch**: The text-content endpoint expected plain text or markdown, not binary Word documents
3. **Processing failures**: Word documents need special HTML conversion using Mammoth, but were being treated as plain text

## Changes Made

### 1. MultiFormatViewer Component (`components/multi-format-viewer.tsx`)
- **Added SSR guard**: Prevent document loading during server-side rendering
- **Added documentId validation**: Ensure documentId is valid before constructing URLs
- **Fixed document type detection**: Explicitly exclude Word documents from text/markdown detection
- **Improved error handling**: Added detailed logging and try-catch around fetch operations
- **URL handling**: Support using the provided URL directly if it's already a text-content endpoint

### 2. DocumentViewerClient Component (`components/document-viewer-client.tsx`)
- **Fixed isTextDocument logic**: Exclude Word documents from text document detection
- Ensures Word documents are routed through the appropriate viewer with Mammoth conversion

### 3. Document Viewer Page (`app/workspaces/[workspaceId]/documents/[documentId]/page.tsx`)
- **Fixed isTextDocument logic**: Exclude Word documents from text-based highlighting
- Word documents now use coordinate-based highlighting like PDFs

### 4. Text-Content API Endpoint (`app/api/documents/[documentId]/text-content/route.ts`)
- **Updated validation**: Explicitly reject Word documents with appropriate error message
- Added comments explaining that Word documents need separate handling

## Technical Details

### Before
```typescript
const isTextDocument = 
  documentType.includes("text") ||
  documentType.includes("markdown") ||
  document.title?.toLowerCase().endsWith(".md") ||
  document.title?.toLowerCase().endsWith(".txt") ||
  document.title?.toLowerCase().endsWith(".docx") ||  // ❌ Wrong!
  document.title?.toLowerCase().endsWith(".doc")     // ❌ Wrong!
```

### After
```typescript
const isTextDocument = 
  (documentType.includes("text") ||
  documentType.includes("markdown") ||
  document.title?.toLowerCase().endsWith(".md") ||
  document.title?.toLowerCase().endsWith(".txt")) &&
  // Explicitly exclude Word documents - they need special handling
  !documentType.includes("word") &&
  !documentType.includes("msword") &&
  !document.title?.toLowerCase().endsWith(".doc") &&
  !document.title?.toLowerCase().endsWith(".docx")  // ✅ Correct!
```

## Document Type Handling

| Document Type | Detection Logic | Rendering Method |
|--------------|----------------|------------------|
| **Markdown** (`.md`) | Text/Markdown detection | Text-content API → Plain text rendering |
| **Plain Text** (`.txt`) | Text/Markdown detection | Text-content API → Plain text rendering |
| **Word** (`.doc`, `.docx`) | Word detection (separate) | Original URL → Mammoth HTML conversion |
| **PDF** (`.pdf`) | PDF detection | PDF API → PDF.js rendering |
| **HTML** (`.html`) | HTML detection | Direct HTML rendering |

## Error Handling Improvements

1. **SSR Protection**: Added check for `typeof window === "undefined"` to prevent SSR execution
2. **Better Logging**: Added detailed context to error logs including:
   - Document ID
   - URLs being fetched
   - Error types and messages
   - Document metadata
3. **Fetch Error Handling**: Wrapped fetch calls in try-catch to capture network errors
4. **Validation**: Added documentId validation before URL construction

## Testing Recommendations

1. **Test Markdown files** (`.md`):
   - Upload and view markdown documents
   - Verify text-content API is called
   - Verify highlighting works

2. **Test Plain Text files** (`.txt`):
   - Upload and view text documents
   - Verify text-content API is called
   - Verify highlighting works

3. **Test Word documents** (`.doc`, `.docx`):
   - Upload and view Word documents
   - Verify Mammoth conversion is used
   - Verify HTML rendering works
   - Verify highlighting uses coordinates

4. **Test PDFs**:
   - Verify PDFs still work correctly
   - Verify PDF-specific features (page navigation, zoom) work

## Additional Notes

- The "Failed to fetch" error was a browser-level error that occurred when the fetch request couldn't be completed (before getting any HTTP response)
- This typically indicates a malformed URL, network error, or request that the browser refused to send
- The fix ensures each document type is routed to the appropriate viewer and API endpoint

