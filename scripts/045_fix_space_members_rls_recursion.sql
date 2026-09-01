-- Fix infinite recursion on space_members RLS (local + fresh installs).
-- Multiple overlapping policies queried space_members from within space_members policies.

BEGIN;

-- Ensure helpers bypass RLS
CREATE OR REPLACE FUNCTION public.get_user_space_ids(check_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT space_id FROM space_members WHERE user_id = check_user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_user_admin_space_ids(check_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT space_id FROM space_members
  WHERE user_id = check_user_id
    AND role IN ('owner', 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.get_user_space_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_admin_space_ids(uuid) TO authenticated, service_role;

-- Drop every known space_members policy (legacy + current)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'space_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.space_members', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;

-- Own membership always visible (breaks bootstrap/recursion)
CREATE POLICY "Users can view own space membership"
  ON public.space_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Members can view other members in their spaces
CREATE POLICY "Members can view space members"
  ON public.space_members FOR SELECT TO authenticated
  USING (space_id IN (SELECT public.get_user_space_ids(auth.uid())));

-- Admins/owners manage membership
CREATE POLICY "Admins can insert space members"
  ON public.space_members FOR INSERT TO authenticated
  WITH CHECK (space_id IN (SELECT public.get_user_admin_space_ids(auth.uid())));

CREATE POLICY "Admins can update space members"
  ON public.space_members FOR UPDATE TO authenticated
  USING (space_id IN (SELECT public.get_user_admin_space_ids(auth.uid())))
  WITH CHECK (space_id IN (SELECT public.get_user_admin_space_ids(auth.uid())));

CREATE POLICY "Admins can delete space members"
  ON public.space_members FOR DELETE TO authenticated
  USING (space_id IN (SELECT public.get_user_admin_space_ids(auth.uid())));

COMMIT;
