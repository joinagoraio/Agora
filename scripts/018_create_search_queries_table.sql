-- Phase 1.9: Create Search Queries Table
-- Stores saved search queries for workspaces

CREATE TABLE IF NOT EXISTS public.search_queries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  query text NOT NULL,
  filters jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_search_queries_tenant_id ON public.search_queries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_search_queries_user_id ON public.search_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_search_queries_workspace_id ON public.search_queries(workspace_id);

-- Enable RLS
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their search_queries"
  ON public.search_queries FOR SELECT
  USING (
    user_id = auth.uid()
    OR tenant_id IN (SELECT unnest(get_user_space_ids()))
  );

CREATE POLICY "Users can create search_queries"
  ON public.search_queries FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IN (SELECT unnest(get_user_space_ids()))
  );

CREATE POLICY "Users can delete their search_queries"
  ON public.search_queries FOR DELETE
  USING (user_id = auth.uid());

-- Add comments
COMMENT ON TABLE public.search_queries IS 'Saved search queries for workspaces';
COMMENT ON COLUMN public.search_queries.filters IS 'Search filters as JSON (domain, municipality, year, etc.)';

