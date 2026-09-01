-- Phase 2: playbooks and versions

CREATE TABLE IF NOT EXISTS public.playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  workspace_kind text NOT NULL DEFAULT 'environmental_programme'
    CHECK (workspace_kind IN ('research', 'environmental_programme')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playbook_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body text NOT NULL DEFAULT '',
  changelog text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playbook_id, version)
);

CREATE INDEX IF NOT EXISTS idx_playbooks_space ON public.playbooks(space_id);
CREATE INDEX IF NOT EXISTS idx_playbook_versions_playbook ON public.playbook_versions(playbook_id);

ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Space members can view playbooks" ON public.playbooks;
CREATE POLICY "Space members can view playbooks" ON public.playbooks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.space_members sm WHERE sm.space_id = playbooks.space_id AND sm.user_id = auth.uid()));

DROP POLICY IF EXISTS "Space admins manage playbooks" ON public.playbooks;
CREATE POLICY "Space admins manage playbooks" ON public.playbooks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.space_members sm WHERE sm.space_id = playbooks.space_id AND sm.user_id = auth.uid() AND sm.role IN ('admin', 'owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.space_members sm WHERE sm.space_id = playbooks.space_id AND sm.user_id = auth.uid() AND sm.role IN ('admin', 'owner')));

DROP POLICY IF EXISTS "Space members can view playbook versions" ON public.playbook_versions;
CREATE POLICY "Space members can view playbook versions" ON public.playbook_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.playbooks p
    JOIN public.space_members sm ON sm.space_id = p.space_id
    WHERE p.id = playbook_versions.playbook_id AND sm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Space admins manage playbook versions" ON public.playbook_versions;
CREATE POLICY "Space admins manage playbook versions" ON public.playbook_versions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.playbooks p
    JOIN public.space_members sm ON sm.space_id = p.space_id
    WHERE p.id = playbook_versions.playbook_id AND sm.user_id = auth.uid() AND sm.role IN ('admin', 'owner')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.playbooks p
    JOIN public.space_members sm ON sm.space_id = p.space_id
    WHERE p.id = playbook_versions.playbook_id AND sm.user_id = auth.uid() AND sm.role IN ('admin', 'owner')
  ));
