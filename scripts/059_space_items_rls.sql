-- Restore space_items RLS policies.
-- Local/demo databases had RLS enabled on space_items with zero policies,
-- so authenticated inserts failed with:
--   new row violates row-level security policy for table "space_items"
--
-- Writers match the authority page: owner, admin, and member (not viewer).
-- Helpers are SECURITY DEFINER so checks do not recurse through space_members RLS.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_items TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_space_role(uuid, uuid, text[]) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can view space_items in their spaces" ON public.space_items;
DROP POLICY IF EXISTS "Space admins can create space_items" ON public.space_items;
DROP POLICY IF EXISTS "Space admins can update space_items" ON public.space_items;
DROP POLICY IF EXISTS "Space admins can delete space_items" ON public.space_items;
DROP POLICY IF EXISTS "Space members can create space_items" ON public.space_items;
DROP POLICY IF EXISTS "Space members can update space_items" ON public.space_items;
DROP POLICY IF EXISTS "Space members can delete space_items" ON public.space_items;

CREATE POLICY "Users can view space_items in their spaces"
  ON public.space_items FOR SELECT
  USING (
    is_space_member(space_id, auth.uid())
    OR classification = 'public'
  );

CREATE POLICY "Space members can create space_items"
  ON public.space_items FOR INSERT
  WITH CHECK (
    has_space_role(
      space_id,
      auth.uid(),
      ARRAY['owner', 'admin', 'member', 'tenant_admin', 'org_manager', 'contributor']::text[]
    )
  );

CREATE POLICY "Space members can update space_items"
  ON public.space_items FOR UPDATE
  USING (
    has_space_role(
      space_id,
      auth.uid(),
      ARRAY['owner', 'admin', 'member', 'tenant_admin', 'org_manager', 'contributor']::text[]
    )
  )
  WITH CHECK (
    has_space_role(
      space_id,
      auth.uid(),
      ARRAY['owner', 'admin', 'member', 'tenant_admin', 'org_manager', 'contributor']::text[]
    )
  );

CREATE POLICY "Space members can delete space_items"
  ON public.space_items FOR DELETE
  USING (
    has_space_role(
      space_id,
      auth.uid(),
      ARRAY['owner', 'admin', 'member', 'tenant_admin', 'org_manager', 'contributor']::text[]
    )
  );

COMMIT;
