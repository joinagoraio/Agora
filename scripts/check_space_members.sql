-- Check if the invited users were actually added to space_members

-- Replace with your actual space_id from the logs: d101a39c-c750-48fa-a5e9-e7f90273819f

SELECT 
  sm.id,
  sm.user_id,
  sm.role,
  sm.created_at,
  p.email,
  p.full_name
FROM space_members sm
LEFT JOIN profiles p ON p.id = sm.user_id
WHERE sm.space_id = 'd101a39c-c750-48fa-a5e9-e7f90273819f'
ORDER BY sm.created_at DESC;

-- Also check recent accepted invitations
SELECT 
  id,
  email,
  role,
  accepted_at,
  created_at
FROM invitations
WHERE space_id = 'd101a39c-c750-48fa-a5e9-e7f90273819f'
  AND accepted_at IS NOT NULL
ORDER BY accepted_at DESC;

