-- Complete fix for infinite recursion in space_members RLS
-- This script drops ALL existing policies and creates simple, non-recursive ones

-- Drop all existing policies on space_members
DROP POLICY IF EXISTS "Members can view space members (SELECT)" ON space_members;
DROP POLICY IF EXISTS "Owners and admins can manage members (ALL)" ON space_members;
DROP POLICY IF EXISTS "Users can view their own memberships" ON space_members;
DROP POLICY IF EXISTS "Space admins can manage members" ON space_members;
DROP POLICY IF EXISTS "Users can view space members" ON space_members;

-- Drop and recreate helper functions as SECURITY DEFINER to bypass RLS
DROP FUNCTION IF EXISTS is_space_member(uuid, uuid);
DROP FUNCTION IF EXISTS has_space_role(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS get_user_space_ids();
DROP FUNCTION IF EXISTS get_user_admin_space_ids();

-- Create a simple security definer function that bypasses RLS
CREATE OR REPLACE FUNCTION is_user_in_space(p_user_id uuid, p_space_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM space_members
    WHERE user_id = p_user_id
    AND space_id = p_space_id
  );
$$;

-- Create simple, non-recursive RLS policies for space_members

-- Policy 1: Users can always view their own memberships (direct check, no recursion)
CREATE POLICY "Users view own memberships"
ON space_members
FOR SELECT
USING (user_id = auth.uid());

-- Policy 2: Users can view other members in spaces they belong to
-- This uses the security definer function which bypasses RLS
CREATE POLICY "Users view members in their spaces"
ON space_members
FOR SELECT
USING (is_user_in_space(auth.uid(), space_id));

-- Policy 3: Only owners and admins can insert/update/delete members
CREATE POLICY "Admins manage members"
ON space_members
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM space_members sm
    WHERE sm.space_id = space_members.space_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('owner', 'admin')
  )
);

-- Recreate helper functions for other tables to use
CREATE OR REPLACE FUNCTION is_space_member(p_space_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM space_members
    WHERE space_id = p_space_id
    AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION has_space_role(p_space_id uuid, p_user_id uuid DEFAULT auth.uid(), p_roles text[] DEFAULT ARRAY['owner', 'admin'])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM space_members
    WHERE space_id = p_space_id
    AND user_id = p_user_id
    AND role = ANY(p_roles)
  );
$$;
