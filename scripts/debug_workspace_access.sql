-- Comprehensive debug for workspace access issue
-- Run this to see EXACTLY why you're being denied access

-- Your user ID
SELECT auth.uid() as my_user_id;

-- The workspace details
SELECT 
  'WORKSPACE' as info_type,
  id,
  name,
  space_id,
  created_by,
  created_by = auth.uid() as i_am_creator
FROM workspaces
WHERE id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126';

-- Check space membership
SELECT 
  'SPACE MEMBERSHIP CHECK' as info_type,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ YES - You are a space member'
    ELSE '❌ NO - You are NOT a space member'
  END as result,
  MAX(sm.role) as your_role
FROM space_members sm
WHERE sm.user_id = auth.uid()
AND sm.space_id = (
  SELECT space_id FROM workspaces WHERE id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126'
);

-- Check workspace membership
SELECT 
  'WORKSPACE MEMBERSHIP CHECK' as info_type,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ YES - You are a workspace member'
    ELSE '❌ NO - You are NOT a workspace member'
  END as result,
  MAX(wm.role) as your_role
FROM workspace_members wm
WHERE wm.user_id = auth.uid()
AND wm.workspace_id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126';

-- Who ARE the workspace members?
SELECT 
  'ACTUAL WORKSPACE MEMBERS' as info_type,
  wm.user_id,
  wm.role,
  p.email,
  wm.user_id = auth.uid() as is_me
FROM workspace_members wm
JOIN profiles p ON p.id = wm.user_id
WHERE wm.workspace_id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126';

-- Who are the space members of the workspace's parent space?
SELECT 
  'SPACE MEMBERS (of workspace parent space)' as info_type,
  sm.user_id,
  sm.role,
  p.email,
  sm.user_id = auth.uid() as is_me
FROM space_members sm
JOIN profiles p ON p.id = sm.user_id
WHERE sm.space_id = (
  SELECT space_id FROM workspaces WHERE id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126'
);

-- Test the policy logic directly
SELECT 
  'POLICY TEST - Space Member Path' as test_type,
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126'
    AND is_space_member(w.space_id, auth.uid())
  ) as should_grant_access_via_space;

SELECT 
  'POLICY TEST - Workspace Member Path' as test_type,
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126'
    AND wm.user_id = auth.uid()
  ) as should_grant_access_via_workspace;

-- Combined policy test (this is what the actual policy uses)
SELECT 
  'COMBINED POLICY TEST' as test_type,
  (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126'
      AND is_space_member(w.space_id, auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126'
      AND wm.user_id = auth.uid()
    )
  ) as should_have_access;

-- Try to actually query workspace_comments
SELECT 
  'ACTUAL QUERY TEST' as test_type,
  COUNT(*) as comment_count
FROM workspace_comments
WHERE workspace_id = '12b2bfb6-9d01-45fb-8e04-ad627bf14126';

