-- Guidance model S1: jobs on membership (not RBAC). Do not confuse with programme_jobs.

ALTER TABLE public.space_members
  ADD COLUMN IF NOT EXISTS job text NOT NULL DEFAULT 'none';

ALTER TABLE public.space_members
  DROP CONSTRAINT IF EXISTS space_members_job_check;
ALTER TABLE public.space_members
  ADD CONSTRAINT space_members_job_check CHECK (job IN ('administrator', 'none'));

ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS job text NOT NULL DEFAULT 'author';

ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_job_check;
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_job_check CHECK (job IN ('author', 'reviewer'));

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS job text;

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_job_check;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_job_check CHECK (job IS NULL OR job IN ('administrator', 'none'));

ALTER TABLE public.workspace_invitations
  ADD COLUMN IF NOT EXISTS job text;

ALTER TABLE public.workspace_invitations
  DROP CONSTRAINT IF EXISTS workspace_invitations_job_check;
ALTER TABLE public.workspace_invitations
  ADD CONSTRAINT workspace_invitations_job_check CHECK (job IS NULL OR job IN ('author', 'reviewer'));

UPDATE public.space_members
SET job = 'administrator'
WHERE role IN ('owner', 'admin') AND job = 'none';

CREATE TABLE IF NOT EXISTS public.membership_job_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_job text,
  to_job text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_job_audit_space ON public.membership_job_audit(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_membership_job_audit_workspace ON public.membership_job_audit(workspace_id, created_at DESC);

ALTER TABLE public.membership_job_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view space job audit" ON public.membership_job_audit;
CREATE POLICY "Members can view space job audit"
  ON public.membership_job_audit FOR SELECT
  USING (
    (space_id IS NOT NULL AND is_space_member(space_id, auth.uid()))
    OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Actors can insert job audit" ON public.membership_job_audit;
CREATE POLICY "Actors can insert job audit"
  ON public.membership_job_audit FOR INSERT
  WITH CHECK (actor_id = auth.uid());

GRANT SELECT, INSERT ON public.membership_job_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_space()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.uid(), NEW.owner_id) IS NULL THEN
    RAISE EXCEPTION 'Cannot create space_members row: both auth.uid() and spaces.owner_id are null';
  END IF;

  INSERT INTO public.space_members (space_id, user_id, role, job)
  VALUES (NEW.id, coalesce(auth.uid(), NEW.owner_id), 'owner', 'administrator')
  ON CONFLICT (space_id, user_id) DO UPDATE
    SET job = EXCLUDED.job
    WHERE public.space_members.job IS DISTINCT FROM 'administrator';

  RETURN NEW;
END;
$$;
