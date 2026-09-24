-- Writers can remove a colleague note on the live draft.
-- Replies disappear with the note (parent_id already cascades).

DROP POLICY IF EXISTS "Workspace writers delete programme comments" ON public.programme_comments;
CREATE POLICY "Workspace writers delete programme comments" ON public.programme_comments FOR DELETE
  USING (is_workspace_writer(programme_comments.workspace_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programme_comments TO authenticated;
REVOKE ALL ON public.programme_comments FROM anon;
