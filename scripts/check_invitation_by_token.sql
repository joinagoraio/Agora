-- Check if invitations can be queried by token
-- Replace 'YOUR-TOKEN-HERE' with an actual token from your invitation email

-- 1. Check if any invitations exist
SELECT 
  COUNT(*) as total_invitations,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
  COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_count,
  COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_count
FROM invitations;

-- 2. Show recent invitations (with partial token for privacy)
SELECT 
  invitations.id,
  invitations.email,
  invitations.role,
  invitations.status,
  invitations.expires_at,
  SUBSTRING(invitations.token, 1, 8) || '...' as token_preview,
  CASE 
    WHEN invitations.expires_at < NOW() THEN 'EXPIRED'
    WHEN invitations.status = 'pending' THEN 'VALID'
    ELSE UPPER(invitations.status)
  END as invitation_state,
  s.name as space_name
FROM invitations
LEFT JOIN spaces s ON s.id = invitations.space_id
ORDER BY invitations.created_at DESC
LIMIT 5;

-- 3. Test the RLS policy for public (anon) access
-- This simulates what happens when an unauthenticated user visits /invite/[token]
SELECT 
  'Testing RLS policy for anon users...' as test;

-- Check current role
SELECT current_user, session_user;

-- 4. Instructions for testing with a specific token:
/*
-- Replace YOUR-TOKEN-HERE with actual token from email:

SELECT 
  id,
  email,
  role,
  status,
  expires_at,
  space_id,
  spaces.name as space_name
FROM invitations
LEFT JOIN spaces ON spaces.id = invitations.space_id
WHERE token = 'YOUR-TOKEN-HERE';

*/

