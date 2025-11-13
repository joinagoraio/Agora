-- Phase 1.8: Update RLS Policies for New Tables
-- Adds Row Level Security policies for space_items, workspace_space_links, workspace_items, and collaboration tables

-- Enable RLS on new tables
ALTER TABLE public.space_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_space_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is member of a space
CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_members
    WHERE space_id = p_space_id
    AND user_id = auth.uid()
  );
$$;

-- Helper function to get user's space IDs
CREATE OR REPLACE FUNCTION public.get_user_space_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT space_id
    FROM public.space_members
    WHERE user_id = auth.uid()
  );
$$;

-- ============================================
-- SPACE_ITEMS POLICIES
-- ============================================

-- Users can view space_items in spaces they belong to
-- Public items are visible to all authenticated users
CREATE POLICY "Users can view space_items in their spaces"
  ON public.space_items FOR SELECT
  USING (
    is_space_member(space_id) 
    OR classification = 'public'
  );

-- Space admins/owners can create space_items
CREATE POLICY "Space admins can create space_items"
  ON public.space_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.space_members
      WHERE space_id = space_items.space_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Space admins/owners can update space_items
CREATE POLICY "Space admins can update space_items"
  ON public.space_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.space_members
      WHERE space_id = space_items.space_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Space admins/owners can delete space_items
CREATE POLICY "Space admins can delete space_items"
  ON public.space_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.space_members
      WHERE space_id = space_items.space_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- WORKSPACE_SPACE_LINKS POLICIES
-- ============================================

-- Users can view workspace_space_links for workspaces they have access to
CREATE POLICY "Users can view workspace_space_links"
  ON public.workspace_space_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_space_links.workspace_id
      AND is_space_member(s.id)
    )
  );

-- Workspace creators/admins can create workspace_space_links
CREATE POLICY "Workspace admins can create workspace_space_links"
  ON public.workspace_space_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_space_links.workspace_id
      AND (
        w.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = s.id
          AND sm.user_id = auth.uid()
          AND sm.role IN ('owner', 'admin')
        )
      )
    )
    AND is_space_member(workspace_space_links.space_id)
  );

-- Workspace creators/admins can delete workspace_space_links
CREATE POLICY "Workspace admins can delete workspace_space_links"
  ON public.workspace_space_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_space_links.workspace_id
      AND (
        w.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = s.id
          AND sm.user_id = auth.uid()
          AND sm.role IN ('owner', 'admin')
        )
      )
    )
  );

-- ============================================
-- WORKSPACE_ITEMS POLICIES
-- ============================================

-- Users can view workspace_items in workspaces they have access to
-- Reference items are read-only, local items follow workspace permissions
CREATE POLICY "Users can view workspace_items"
  ON public.workspace_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_items.workspace_id
      AND is_space_member(s.id)
    )
  );

-- Users can create local workspace_items in workspaces they have access to
CREATE POLICY "Users can create local workspace_items"
  ON public.workspace_items FOR INSERT
  WITH CHECK (
    inheritance = 'local'
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_items.workspace_id
      AND is_space_member(s.id)
    )
  );

-- Users can update local workspace_items they created
CREATE POLICY "Users can update their local workspace_items"
  ON public.workspace_items FOR UPDATE
  USING (
    inheritance = 'local'
    AND created_by = auth.uid()
  );

-- Users can delete local workspace_items they created
CREATE POLICY "Users can delete their local workspace_items"
  ON public.workspace_items FOR DELETE
  USING (
    inheritance = 'local'
    AND created_by = auth.uid()
  );

-- ============================================
-- COLLABORATION TABLES POLICIES
-- ============================================

-- Workspace Notes Policies
CREATE POLICY "Users can view workspace_notes"
  ON public.workspace_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_notes.workspace_id
      AND is_space_member(s.id)
    )
  );

CREATE POLICY "Users can create workspace_notes"
  ON public.workspace_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_notes.workspace_id
      AND is_space_member(s.id)
    )
  );

CREATE POLICY "Users can update their workspace_notes"
  ON public.workspace_notes FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their workspace_notes"
  ON public.workspace_notes FOR DELETE
  USING (created_by = auth.uid());

-- Workspace Comments Policies
CREATE POLICY "Users can view workspace_comments"
  ON public.workspace_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_comments.workspace_id
      AND is_space_member(s.id)
    )
  );

CREATE POLICY "Users can create workspace_comments"
  ON public.workspace_comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_comments.workspace_id
      AND is_space_member(s.id)
    )
  );

CREATE POLICY "Users can delete their workspace_comments"
  ON public.workspace_comments FOR DELETE
  USING (created_by = auth.uid());

-- Workspace Activity Policies
CREATE POLICY "Users can view workspace_activity"
  ON public.workspace_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.spaces s ON w.space_id = s.id
      WHERE w.id = workspace_activity.workspace_id
      AND is_space_member(s.id)
    )
  );

CREATE POLICY "System can create workspace_activity"
  ON public.workspace_activity FOR INSERT
  WITH CHECK (true); -- Activity is created by system triggers

-- ============================================
-- UPDATE DOCUMENTS RLS TO INCLUDE TENANT_ID
-- ============================================

-- Update documents policies to use tenant_id for better performance
-- Note: This supplements existing policies, doesn't replace them
DROP POLICY IF EXISTS "Documents are tenant-isolated" ON public.documents;
CREATE POLICY "Documents are tenant-isolated"
  ON public.documents FOR SELECT
  USING (
    tenant_id IN (SELECT unnest(get_user_space_ids()))
    OR classification = 'public'
  );
