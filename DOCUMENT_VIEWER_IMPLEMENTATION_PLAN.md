# Document Viewer & Highlighting Implementation Plan

## Overview
This plan outlines the implementation of an in-app PDF viewer with AI-powered text highlighting capabilities. Documents will open within the application, and the AI will be able to reference and highlight specific sections when answering questions.

## Architecture

### Components
1. **PDF Viewer Component** - Renders PDFs using react-pdf
2. **Highlight Overlay System** - SVG-based highlighting with coordinate mapping
3. **Document Viewer Page** - Full-page document viewing experience
4. **Enhanced RAG System** - Returns page numbers and text positions
5. **Chat Integration** - Deep linking to documents with highlights

### Data Flow
1. PDF uploaded → Extract text + coordinates → Store in `document_pages` table
2. User asks question → RAG search → Returns documents with page/position info
3. AI response → Includes source references with highlight data
4. User clicks source → Opens document viewer → Highlights referenced text

---

## Phase 1: Foundation & Dependencies

### Task 1.1: Install Required Packages
**Status:** Pending  
**Files:** `package.json`

```bash
pnpm add react-pdf
pnpm add -D @types/react-pdf
```

**Dependencies:**
- `react-pdf` - PDF rendering component
- `pdfjs-dist` - Already installed, used by react-pdf
- `pdf-parse` - Already installed, used for server-side extraction

---

## Phase 2: Database Schema

### Task 2.1: Create Document Pages Table
**Status:** Pending  
**Files:** `scripts/add_document_pages_table.sql`

Create a new table to store page-level information:
- Page number
- Page text content
- Text items with coordinates (for highlighting)
- Character offsets

**Schema:**
```sql
create table if not exists public.document_pages (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade not null,
  page_number integer not null,
  text_content text,
  text_items jsonb, -- Array of {text, x, y, width, height, fontSize}
  character_offsets jsonb, -- Map of text positions for highlighting
  created_at timestamp with time zone default now(),
  unique(document_id, page_number)
);

create index idx_document_pages_document_id on public.document_pages(document_id);
create index idx_document_pages_page_number on public.document_pages(document_id, page_number);
```

### Task 2.2: Add Highlight Metadata to Messages
**Status:** Pending  
**Files:** `scripts/add_highlight_metadata.sql`

Enhance the `sources` JSONB field in messages to include:
- `documentId`
- `pageNumber`
- `textSpan` (start/end character positions)
- `coordinates` (optional bounding boxes)

No schema change needed - will use existing `sources` JSONB field.

---

## Phase 3: Enhanced PDF Processing

### Task 3.1: Create PDF Text Extraction Utility
**Status:** Pending  
**Files:** `lib/utils/pdf-extraction.ts`

Create utility functions to:
- Extract page-by-page text using `pdf-parse`
- Extract text items with coordinates using `pdfjs-dist`
- Map text to character offsets
- Store structured data

**Key Functions:**
- `extractPdfPages(buffer: Buffer)` - Extract all pages
- `extractTextItems(page: PDFPage)` - Get text with coordinates
- `buildCharacterOffsetMap(textItems: TextItem[])` - Create offset mapping

### Task 3.2: Update Document Upload Handler
**Status:** Pending  
**Files:** `lib/actions/document.ts`

Enhance `uploadDocument` function to:
1. Extract PDF pages with coordinates
2. Store each page in `document_pages` table
3. Store text items and character offsets
4. Maintain backward compatibility with existing `content` field

**Changes:**
- After PDF parsing, extract page-by-page data
- Insert records into `document_pages` table
- Store text items as JSONB for highlighting

### Task 3.3: Update Add Documents From Source
**Status:** Pending  
**Files:** `lib/actions/document.ts`

Apply same PDF processing enhancements to `addDocumentsFromSource`:
- Extract pages when fetching PDFs from URLs
- Store page data in `document_pages` table

---

## Phase 4: PDF Viewer Component

### Task 4.1: Create PDF Viewer Component
**Status:** Pending  
**Files:** `components/pdf-viewer.tsx`

Create a reusable PDF viewer component with:
- Page navigation (prev/next, page input)
- Zoom controls
- Text rendering
- Loading states
- Error handling

**Props:**
```typescript
interface PDFViewerProps {
  url: string
  documentId: string
  highlights?: Highlight[]
  onPageChange?: (page: number) => void
  initialPage?: number
}
```

**Features:**
- Render PDF pages using `react-pdf`
- Support zoom in/out
- Page navigation
- Responsive layout

### Task 4.2: Create Highlight Overlay Component
**Status:** Pending  
**Files:** `components/pdf-highlight-overlay.tsx`

Create SVG overlay component for highlights:
- Render highlights as SVG rectangles
- Position highlights based on text coordinates
- Support multiple highlights
- Different highlight colors/styles

**Props:**
```typescript
interface HighlightOverlayProps {
  pageNumber: number
  highlights: Highlight[]
  pageWidth: number
  pageHeight: number
  scale: number
}
```

**Highlight Type:**
```typescript
interface Highlight {
  id: string
  pageNumber: number
  textSpan: { start: number; end: number }
  coordinates?: { x: number; y: number; width: number; height: number }
  color?: string
}
```

### Task 4.3: Integrate Highlight Overlay with PDF Viewer
**Status:** Pending  
**Files:** `components/pdf-viewer.tsx`

Combine PDF viewer with highlight overlay:
- Position overlay absolutely over PDF canvas
- Sync highlights with current page
- Handle zoom/scale changes
- Support click-to-scroll to highlight

---

## Phase 5: Document Viewer Page

### Task 5.1: Create Document Viewer Route
**Status:** Pending  
**Files:** `app/workspaces/[workspaceId]/documents/[documentId]/page.tsx`

Create full-page document viewer:
- Fetch document data
- Render PDF viewer
- Sidebar with document info
- Chat integration (optional)
- URL state management for page/highlights

**Page Structure:**
- Header with document title and actions
- Main area with PDF viewer
- Sidebar with metadata and chat (optional)
- URL params: `?page=1&highlight=abc123`

### Task 5.2: Create Document Actions Component
**Status:** Pending  
**Files:** `components/document-viewer-actions.tsx`

Actions toolbar:
- Download document
- Share document
- Archive/Delete
- Back to workspace

### Task 5.3: Add Server Action for Document Pages
**Status:** Pending  
**Files:** `lib/actions/document.ts`

Add function to fetch document pages:
```typescript
export async function getDocumentPages(documentId: string)
```

Returns:
- All pages with text content
- Text items with coordinates
- Character offset maps

---

## Phase 6: Enhanced RAG System

### Task 6.1: Update Search to Return Page Information
**Status:** Pending  
**Files:** `lib/rag/search.ts`

Enhance `searchDocuments` to:
- Join with `document_pages` table
- Return page numbers where matches occur
- Include text positions within pages

**Changes:**
- Query `document_pages` for matching text
- Return page numbers with search results
- Include character offsets for matched text

### Task 6.2: Update getRelevantContext to Include Highlight Data
**Status:** Pending  
**Files:** `lib/rag/search.ts`

Modify `getRelevantContext` to return:
- Document ID
- Page number(s) where context was found
- Text span (start/end positions)
- Optional bounding box coordinates

**Source Format:**
```typescript
{
  id: string
  title: string
  url: string
  pageNumber: number
  textSpan: { start: number; end: number }
  preview: string // Text preview around the match
}
```

### Task 6.3: Create Text Matching Utility
**Status:** Pending  
**Files:** `lib/utils/text-matching.ts`

Utility to:
- Find text spans in document pages
- Map text to character offsets
- Calculate bounding boxes for highlights
- Handle fuzzy matching

**Functions:**
- `findTextSpan(pageText: string, query: string)` - Find text position
- `getHighlightCoordinates(textSpan, textItems)` - Get bounding box
- `buildHighlightData(documentId, pageNumber, textSpan)` - Build highlight object

---

## Phase 7: Chat Integration

### Task 7.1: Update Chat Interface for Document Links
**Status:** Pending  
**Files:** `components/chat-interface.tsx`

Enhance source citations to:
- Link to document viewer
- Pass highlight parameters in URL
- Show page number in badge
- Add "View in Document" button

**Changes:**
- Update source badge to include page number
- Make source clickable → navigate to document viewer
- Pass `documentId`, `pageNumber`, `textSpan` in URL

### Task 7.2: Update Chat API Response Format
**Status:** Pending  
**Files:** `app/api/chat/route.ts`

Ensure sources include:
- `documentId` (not just external URL)
- `pageNumber`
- `textSpan`
- `preview` text

### Task 7.3: Create Document Deep Link Handler
**Status:** Pending  
**Files:** `lib/utils/document-linking.ts`

Utility functions for:
- Building document viewer URLs with highlights
- Parsing highlight parameters from URL
- Navigating to document with highlights

**Functions:**
```typescript
buildDocumentUrl(documentId: string, pageNumber?: number, highlight?: TextSpan)
parseDocumentUrl(url: string): DocumentLinkParams
```

---

## Phase 8: UI/UX Enhancements

### Task 8.1: Update Documents List to Link to Viewer
**Status:** Pending  
**Files:** `components/documents-list.tsx`

Change "View file" link to:
- Open in-app document viewer
- Instead of external link
- Show "View Document" button

### Task 8.2: Add Highlight Management UI
**Status:** Pending  
**Files:** `components/document-viewer.tsx`

Add UI for:
- Clear all highlights
- Navigate between highlights
- Show highlight count
- Highlight list sidebar

### Task 8.3: Add Loading States
**Status:** Pending  
**Files:** `components/pdf-viewer.tsx`

Implement:
- Skeleton loader for PDF pages
- Progress indicator for multi-page documents
- Error states with retry

### Task 8.4: Mobile Responsiveness
**Status:** Pending  
**Files:** `components/pdf-viewer.tsx`, `app/workspaces/[workspaceId]/documents/[documentId]/page.tsx`

Ensure:
- Touch-friendly navigation
- Responsive layout
- Mobile-optimized controls

---

## Phase 9: Performance Optimization

### Task 9.1: Implement Page Lazy Loading
**Status:** Pending  
**Files:** `components/pdf-viewer.tsx`

Load pages on-demand:
- Only render visible pages
- Preload adjacent pages
- Unload distant pages

### Task 9.2: Cache Rendered Pages
**Status:** Pending  
**Files:** `components/pdf-viewer.tsx`

Cache rendered PDF pages:
- Use React state/memoization
- Cache canvas renders
- Clear cache on unmount

### Task 9.3: Optimize Highlight Rendering
**Status:** Pending  
**Files:** `components/pdf-highlight-overlay.tsx`

Optimize SVG overlay:
- Only render highlights for current page
- Use CSS transforms for positioning
- Debounce highlight updates

---

## Phase 10: Testing & Polish

### Task 10.1: Test PDF Processing
**Status:** Pending

Test with:
- Various PDF types (text-based, scanned, mixed)
- Large PDFs (100+ pages)
- PDFs with complex layouts
- Edge cases (empty pages, images only)

### Task 10.2: Test Highlighting Accuracy
**Status:** Pending

Verify:
- Highlights match referenced text
- Coordinates are accurate
- Multiple highlights work correctly
- Cross-page highlights

### Task 10.3: Test Chat Integration
**Status:** Pending

Verify:
- Sources link correctly to documents
- Highlights appear when clicking sources
- Page navigation works
- URL state persists

### Task 10.4: Performance Testing
**Status:** Pending

Test:
- Large document loading times
- Multiple simultaneous highlights
- Memory usage with many pages
- Network optimization

---

## Implementation Order

### Week 1: Foundation
1. ✅ Install dependencies (Task 1.1)
2. ✅ Create database schema (Tasks 2.1, 2.2)
3. ✅ Enhanced PDF processing (Tasks 3.1, 3.2, 3.3)

### Week 2: Viewer Components
4. ✅ PDF viewer component (Task 4.1)
5. ✅ Highlight overlay (Task 4.2)
6. ✅ Integrate components (Task 4.3)

### Week 3: Pages & RAG
7. ✅ Document viewer page (Tasks 5.1, 5.2, 5.3)
8. ✅ Enhanced RAG system (Tasks 6.1, 6.2, 6.3)

### Week 4: Integration & Polish
9. ✅ Chat integration (Tasks 7.1, 7.2, 7.3)
10. ✅ UI enhancements (Tasks 8.1, 8.2, 8.3, 8.4)
11. ✅ Performance optimization (Tasks 9.1, 9.2, 9.3)
12. ✅ Testing (Tasks 10.1, 10.2, 10.3, 10.4)

---

## Technical Considerations

### PDF.js Worker Configuration
- Configure worker path for `react-pdf`
- Handle CORS for Supabase Storage URLs
- Set up proper error boundaries

### Coordinate System
- PDF coordinates (bottom-left origin) vs. DOM coordinates (top-left)
- Scale transformations for zoom
- Viewport calculations

### Security
- Verify document access permissions
- Validate highlight parameters
- Sanitize text content

### Accessibility
- Keyboard navigation
- Screen reader support
- Focus management
- ARIA labels

---

## Success Criteria

✅ Documents open within the application  
✅ PDFs render correctly with page navigation  
✅ AI can reference specific document sections  
✅ Highlights appear accurately on referenced text  
✅ Users can navigate from chat to documents  
✅ Performance is acceptable for large PDFs  
✅ Mobile experience is functional  
✅ Error handling is robust  

---

## Notes

- Maintain backward compatibility with existing document storage
- Consider migration strategy for existing documents
- Plan for future features (annotations, comments, etc.)
- Document API changes for team reference

