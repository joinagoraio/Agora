-- Breaking infinite recursion by creating SECURITY DEFINER helper functions
-- that bypass RLS when checking permissions

-- Create a helper function that bypasses RLS to check space membership
CREATE OR REPLACE FUNCTION public.get_user_space_ids(check_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT space_id FROM space_members WHERE user_id = check_user_id;
$$;

-- Create a helper function that bypasses RLS to check if user has admin role
CREATE OR REPLACE FUNCTION public.get_user_admin_space_ids(check_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT space_id FROM space_members 
  WHERE user_id = check_user_id 
  AND role IN ('owner', 'admin');
$$;

-- Drop all existing policies on space_members
DROP POLICY IF EXISTS "Members can view space members (SELECT)" ON space_members;
DROP POLICY IF EXISTS "Admins can add members (INSERT)" ON space_members;
DROP POLICY IF EXISTS "Admins can update members (UPDATE)" ON space_members;
DROP POLICY IF EXISTS "Admins can remove members (DELETE)" ON space_members;

-- Recreate policies using the SECURITY DEFINER functions
-- These functions bypass RLS, breaking the recursion cycle

CREATE POLICY "Members can view space members (SELECT)"
ON space_members FOR SELECT
TO authenticated
USING (space_id IN (SELECT public.get_user_space_ids(auth.uid())));

CREATE POLICY "Admins can add members (INSERT)"
ON space_members FOR INSERT
TO authenticated
WITH CHECK (space_id IN (SELECT public.get_user_admin_space_ids(auth.uid())));

CREATE POLICY "Admins can update members (UPDATE)"
ON space_members FOR UPDATE
TO authenticated
USING (space_id IN (SELECT public.get_user_admin_space_ids(auth.uid())));

CREATE POLICY "Admins can remove members (DELETE)"
ON space_members FOR DELETE
TO authenticated
USING (space_id IN (SELECT public.get_user_admin_space_ids(auth.uid())));
