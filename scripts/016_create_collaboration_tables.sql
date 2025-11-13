-- Phase 1.7: Create Collaboration Tables
-- Lightweight collaboration features: notes, comments, and activity

CREATE TABLE IF NOT EXISTS public.workspace_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  workspace_item_id uuid REFERENCES public.workspace_items(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_activity (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  description text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workspace_notes_workspace_id ON public.workspace_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_created_by ON public.workspace_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_workspace_comments_workspace_id ON public.workspace_comments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_comments_workspace_item_id ON public.workspace_comments(workspace_item_id);
CREATE INDEX IF NOT EXISTS idx_workspace_comments_created_by ON public.workspace_comments(created_by);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_workspace_id ON public.workspace_activity(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_activity_type ON public.workspace_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_user_id ON public.workspace_activity(user_id);

-- Create trigger for workspace_notes updated_at
CREATE OR REPLACE FUNCTION update_workspace_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workspace_notes_updated_at ON public.workspace_notes;
CREATE TRIGGER trigger_workspace_notes_updated_at
  BEFORE UPDATE ON public.workspace_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_notes_updated_at();

-- Add comments
COMMENT ON TABLE public.workspace_notes IS 'Notes within workspaces for collaboration';
COMMENT ON TABLE public.workspace_comments IS 'Comments on workspace items';
COMMENT ON TABLE public.workspace_activity IS 'Activity log for workspaces';
