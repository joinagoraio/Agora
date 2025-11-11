-- Drop and recreate all helper functions and policies to fix infinite recursion
-- This script completely fixes the circular dependency issue

-- First, drop all existing RLS policies on space_members to break the cycle
DROP POLICY IF EXISTS "Members can view space members" ON space_members;
DROP POLICY IF EXISTS "Admins can add members" ON space_members;
DROP POLICY IF EXISTS "Admins can update members" ON space_members;
DROP POLICY IF EXISTS "Admins can remove members" ON space_members;

-- Drop and recreate helper functions with proper SECURITY DEFINER
DROP FUNCTION IF EXISTS is_space_member(uuid, uuid);
DROP FUNCTION IF EXISTS has_space_role(uuid, uuid, text[]);

-- Create is_space_member function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION is_space_member(p_space_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM space_members 
    WHERE space_id = p_space_id 
    AND user_id = p_user_id
  );
END;
$$;

-- Create has_space_role function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION has_space_role(p_space_id uuid, p_user_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM space_members 
    WHERE space_id = p_space_id 
    AND user_id = p_user_id 
    AND role = ANY(p_roles)
  );
END;
$$;

-- Recreate space_members policies without circular dependency
-- The key is to use direct auth.uid() comparisons instead of calling helper functions

-- SELECT: Users can view members of spaces they belong to
CREATE POLICY "Members can view space members" ON space_members
  FOR SELECT
  USING (
    -- Direct check: user is member of this space (no function call to avoid recursion)
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = space_members.space_id
      AND sm.user_id = auth.uid()
    )
  );

-- INSERT: Admins and owners can add members
CREATE POLICY "Admins can add members" ON space_members
  FOR INSERT
  WITH CHECK (
    -- Direct check: user is owner or admin of this space
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = space_members.space_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

-- UPDATE: Admins and owners can update members
CREATE POLICY "Admins can update members" ON space_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = space_members.space_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

-- DELETE: Admins and owners can remove members
CREATE POLICY "Admins can remove members" ON space_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = space_members.space_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

-- Now update the spaces table policies to also avoid recursion
DROP POLICY IF EXISTS "Users can view their spaces" ON spaces;
DROP POLICY IF EXISTS "Owners and admins can update spaces" ON spaces;
DROP POLICY IF EXISTS "Owners can delete spaces" ON spaces;

-- SELECT: Users can view spaces they are members of
CREATE POLICY "Users can view their spaces" ON spaces
  FOR SELECT
  USING (
    auth.uid() = owner_id OR
    is_space_member(id, auth.uid())
  );

-- UPDATE: Owners and admins can update
CREATE POLICY "Owners and admins can update spaces" ON spaces
  FOR UPDATE
  USING (
    auth.uid() = owner_id OR
    has_space_role(id, auth.uid(), ARRAY['admin'])
  );

-- DELETE: Only owners can delete
CREATE POLICY "Owners can delete spaces" ON spaces
  FOR DELETE
  USING (auth.uid() = owner_id);

-- Update workspaces policies to use helper functions safely
DROP POLICY IF EXISTS "Space members can view workspaces" ON workspaces;
DROP POLICY IF EXISTS "Space members can create workspaces" ON workspaces;
DROP POLICY IF EXISTS "Admins can update workspaces" ON workspaces;
DROP POLICY IF EXISTS "Admins can delete workspaces" ON workspaces;

CREATE POLICY "Space members can view workspaces" ON workspaces
  FOR SELECT
  USING (is_space_member(space_id, auth.uid()));

CREATE POLICY "Space members can create workspaces" ON workspaces
  FOR INSERT
  WITH CHECK (is_space_member(space_id, auth.uid()));

CREATE POLICY "Admins can update workspaces" ON workspaces
  FOR UPDATE
  USING (has_space_role(space_id, auth.uid(), ARRAY['owner', 'admin']));

CREATE POLICY "Admins can delete workspaces" ON workspaces
  FOR DELETE
  USING (has_space_role(space_id, auth.uid(), ARRAY['owner', 'admin']));
