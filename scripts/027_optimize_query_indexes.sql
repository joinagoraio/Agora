-- Phase 3.2: Optimize Database Queries with Composite Indexes
-- This script adds composite indexes for frequently queried column combinations
-- to improve query performance, especially for RAG search and filtering operations

-- ============================================================================
-- DOCUMENTS TABLE INDEXES
-- ============================================================================

-- Composite index for workspace document queries with status filter
-- Used in: app/api/search/route.ts, lib/rag/search.ts
CREATE INDEX IF NOT EXISTS idx_documents_workspace_status_active 
  ON public.documents(workspace_id, status) 
  WHERE status = 'active';

-- Composite index for filtered document searches
-- Used in: app/api/search/route.ts (domain, municipality, classification filters)
CREATE INDEX IF NOT EXISTS idx_documents_workspace_status_classification 
  ON public.documents(workspace_id, status, classification) 
  WHERE status = 'active';

-- Composite index for domain/municipality filtering
CREATE INDEX IF NOT EXISTS idx_documents_workspace_domain_municipality 
  ON public.documents(workspace_id, domain, municipality) 
  WHERE status = 'active' AND domain IS NOT NULL AND municipality IS NOT NULL;

-- Index for publication date range queries
CREATE INDEX IF NOT EXISTS idx_documents_workspace_publication_date 
  ON public.documents(workspace_id, publication_date) 
  WHERE status = 'active' AND publication_date IS NOT NULL;

-- Index for tenant_id lookups (RLS performance)
-- Already exists from 015_extend_documents_schema.sql, but ensure it's there
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON public.documents(tenant_id);

-- ============================================================================
-- DOCUMENT_PAGES TABLE INDEXES
-- ============================================================================

-- Composite index for RAG search (document_id + page_number)
-- Used in: lib/rag/search.ts (batch fetching pages)
CREATE INDEX IF NOT EXISTS idx_document_pages_document_page 
  ON public.document_pages(document_id, page_number);

-- Index for text content searches (used in RAG for phrase matching)
-- Note: Requires pg_trgm extension. If not available, this will be skipped.
-- Full-text search would be better, but this helps with ILIKE queries
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_document_pages_text_content_trgm 
      ON public.document_pages USING gin(text_content gin_trgm_ops)
      WHERE text_content IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- SOURCES TABLE INDEXES
-- ============================================================================

-- Composite index for workspace source lookups by type
-- Used in: app/api/documents/upload/route.ts, lib/actions/document.ts
CREATE INDEX IF NOT EXISTS idx_sources_workspace_type 
  ON public.sources(workspace_id, type);

-- ============================================================================
-- SPACE_MEMBERS TABLE INDEXES
-- ============================================================================

-- Composite index for user-space membership lookups
-- Used in: lib/middleware/authorization.ts, lib/actions/workspace.ts
-- Note: Individual indexes exist, but composite is faster for JOINs
CREATE INDEX IF NOT EXISTS idx_space_members_user_space 
  ON public.space_members(user_id, space_id);

-- Composite index for role-based queries
CREATE INDEX IF NOT EXISTS idx_space_members_space_role 
  ON public.space_members(space_id, role);

-- ============================================================================
-- WORKSPACE_ITEMS TABLE INDEXES
-- ============================================================================

-- Composite index for workspace items with inheritance filter
-- Used in: lib/actions/workspace-item.ts
CREATE INDEX IF NOT EXISTS idx_workspace_items_workspace_inheritance 
  ON public.workspace_items(workspace_id, inheritance);

-- Composite index for workspace items with classification filter
CREATE INDEX IF NOT EXISTS idx_workspace_items_workspace_classification 
  ON public.workspace_items(workspace_id, classification);

-- Composite index for ordered workspace items (created_at DESC)
-- Used in: lib/actions/workspace-item.ts (.order("created_at", { ascending: false }))
CREATE INDEX IF NOT EXISTS idx_workspace_items_workspace_created_at 
  ON public.workspace_items(workspace_id, created_at DESC);

-- ============================================================================
-- SPACE_ITEMS TABLE INDEXES
-- ============================================================================

-- Composite index for space items with type and classification filters
-- Used in: lib/actions/space-item.ts
CREATE INDEX IF NOT EXISTS idx_space_items_space_type_classification 
  ON public.space_items(space_id, item_type, classification);

-- Index for published space items (used in inheritance queries)
-- Note: This index requires the visibility column (added in migration 028)
-- If visibility column doesn't exist yet, run migration 028 first
-- For now, create a conditional index that works with or without visibility
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'space_items' 
    AND column_name = 'visibility'
  ) THEN
    -- Index with visibility column (preferred)
    CREATE INDEX IF NOT EXISTS idx_space_items_space_published 
      ON public.space_items(space_id, item_type, classification, visibility)
      WHERE classification = 'public' OR visibility = 'public';
  ELSE
    -- Fallback: Index without visibility column (will be updated by migration 028)
    CREATE INDEX IF NOT EXISTS idx_space_items_space_published_fallback 
      ON public.space_items(space_id, item_type, classification)
      WHERE classification = 'public';
    
    RAISE NOTICE 'Note: visibility column not found on space_items. Run migration 028_add_visibility_to_space_items.sql to add it.';
  END IF;
END $$;

-- ============================================================================
-- CONVERSATIONS TABLE INDEXES
-- ============================================================================

-- Composite index for user conversations in workspace
-- Used in: lib/actions/conversation.ts
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_user 
  ON public.conversations(workspace_id, user_id);

-- Composite index for context-based conversation queries
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_context 
  ON public.conversations(workspace_id, context_type, context_id)
  WHERE context_type IS NOT NULL AND context_id IS NOT NULL;

-- ============================================================================
-- MESSAGES TABLE INDEXES
-- ============================================================================

-- Index for conversation messages (already exists, but ensure it's optimized)
-- Used in: lib/actions/conversation.ts
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
  ON public.messages(conversation_id, created_at DESC);

-- ============================================================================
-- WORKSPACES TABLE INDEXES
-- ============================================================================

-- Composite index for workspace-space lookups
-- Used in: lib/actions/workspace-space-link.ts
CREATE INDEX IF NOT EXISTS idx_workspaces_space_id 
  ON public.workspaces(space_id)
  WHERE space_id IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_documents_workspace_status_active IS 
  'Optimizes queries for active documents in a workspace (used in search and RAG)';

COMMENT ON INDEX idx_document_pages_document_page IS 
  'Optimizes batch fetching of document pages for RAG search (N+1 query fix)';

COMMENT ON INDEX idx_sources_workspace_type IS 
  'Optimizes source lookups by workspace and type (direct_upload, workspace_generated, etc.)';

COMMENT ON INDEX idx_space_members_user_space IS 
  'Optimizes authorization checks for user-space membership';

COMMENT ON INDEX idx_workspace_items_workspace_created_at IS 
  'Optimizes ordered workspace items queries (created_at DESC)';

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

-- Update table statistics for query planner
ANALYZE public.documents;
ANALYZE public.document_pages;
ANALYZE public.sources;
ANALYZE public.space_members;
ANALYZE public.workspace_items;
ANALYZE public.space_items;
ANALYZE public.conversations;
ANALYZE public.messages;
ANALYZE public.workspaces;

