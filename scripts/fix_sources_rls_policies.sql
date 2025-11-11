-- Fix RLS policies for sources table
-- This script creates the necessary RLS policies for the sources table

-- Step 1: Enable RLS on sources table
ALTER TABLE IF EXISTS sources ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any old connector policies that might exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Space members can view connectors" ON sources;
  DROP POLICY IF EXISTS "Space members can create connectors" ON sources;
  DROP POLICY IF EXISTS "Space members can update connectors" ON sources;
  DROP POLICY IF EXISTS "Space members can delete connectors" ON sources;
  DROP POLICY IF EXISTS "Workspace members can view connectors" ON sources;
  DROP POLICY IF EXISTS "Workspace members can create connectors" ON sources;
  DROP POLICY IF EXISTS "Creators and admins can update connectors" ON sources;
  DROP POLICY IF EXISTS "Creators and admins can delete connectors" ON sources;
END $$;

-- Step 3: Create new source policies
-- View: Workspace members can view sources
CREATE POLICY "Workspace members can view sources"
  ON sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = sources.workspace_id
      AND sm.user_id = auth.uid()
    )
  );

-- Create: Workspace members can create sources
CREATE POLICY "Workspace members can create sources"
  ON sources FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = sources.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin', 'member')
    )
    AND created_by = auth.uid()
  );

-- Update: Creators and admins can update sources
CREATE POLICY "Creators and admins can update sources"
  ON sources FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = sources.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = sources.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

-- Delete: Creators and admins can delete sources
CREATE POLICY "Creators and admins can delete sources"
  ON sources FOR DELETE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = sources.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );
