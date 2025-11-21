-- Update RLS functions to allow members full access to workspaces
-- Members should have the same workspace access as admins
-- Only Settings should be restricted to owner/admin

-- Update is_workspace_member to include members
CREATE OR REPLACE FUNCTION public.is_workspace_member(workspace_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_members.workspace_id = is_workspace_member.workspace_id
      AND workspace_members.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE workspaces.id = is_workspace_member.workspace_id
      -- Members now have full access to workspaces, same as admin
      AND public.has_space_role(workspaces.space_id, 'member')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Update is_workspace_admin to only check actual admin/owner for Settings access
-- This function should remain checking for 'admin' role only
-- No changes needed here as it's used for Settings access
CREATE OR REPLACE FUNCTION public.is_workspace_admin(workspace_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE workspaces.id = is_workspace_admin.workspace_id
      AND (
        workspaces.created_by = auth.uid()
        -- Only admin and owner, not member
        OR public.has_space_role(workspaces.space_id, 'admin')
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_members.workspace_id = is_workspace_admin.workspace_id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid) TO authenticated;

