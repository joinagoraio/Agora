-- 032_helper_function_consistency.sql
-- Consolidate helper functions for space/workspace membership checks.

BEGIN;

SET LOCAL search_path TO public;

DO $drop$
BEGIN
  PERFORM 1;
  EXECUTE 'DROP FUNCTION IF EXISTS public.is_space_member(uuid)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.is_space_admin(uuid)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.is_workspace_member(uuid)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.is_workspace_admin(uuid)';
END;
$drop$;

CREATE OR REPLACE FUNCTION public.is_space_member(space_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  membership_role TEXT;
BEGIN
  IF space_uuid IS NULL OR user_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO membership_role
  FROM space_members
  WHERE space_id = space_uuid
    AND user_id = user_uuid
  LIMIT 1;

  RETURN membership_role IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_space_admin(space_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  membership_role TEXT;
BEGIN
  IF space_uuid IS NULL OR user_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO membership_role
  FROM space_members
  WHERE space_id = space_uuid
    AND user_id = user_uuid
  LIMIT 1;

  RETURN membership_role IN ('owner', 'admin');
END;
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(workspace_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  space_uuid UUID;
  creator_uuid UUID;
BEGIN
  IF workspace_uuid IS NULL OR user_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT space_id, created_by INTO space_uuid, creator_uuid
  FROM workspaces
  WHERE id = workspace_uuid;

  IF space_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF creator_uuid = user_uuid THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
      AND user_id = user_uuid
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN is_space_admin(space_uuid, user_uuid);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(workspace_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  space_uuid UUID;
  creator_uuid UUID;
BEGIN
  IF workspace_uuid IS NULL OR user_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT space_id, created_by INTO space_uuid, creator_uuid
  FROM workspaces
  WHERE id = workspace_uuid;

  IF space_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF creator_uuid = user_uuid THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
      AND user_id = user_uuid
      AND role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN is_space_admin(space_uuid, user_uuid);
END;
$$;

-- Ensure helper functions remain callable only by Supabase roles
DO $regrant$
DECLARE
  fn record;
  role_name TEXT;
  roles TEXT[] := ARRAY['anon', 'authenticated', 'service_role'];
BEGIN
  FOR fn IN
    SELECT oid::regprocedure AS procname
    FROM pg_proc
    WHERE proname IN ('is_space_member', 'is_space_admin', 'is_workspace_member', 'is_workspace_admin')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.procname);
    FOREACH role_name IN ARRAY roles LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', fn.procname, role_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$regrant$;

COMMIT;

