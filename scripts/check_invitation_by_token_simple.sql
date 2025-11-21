-- Simple check for invitations
-- First, let's see what columns exist

-- 1. Show table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'invitations' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Show recent invitations (basic columns only)
SELECT 
  invitations.id,
  invitations.email,
  invitations.role,
  invitations.expires_at,
  invitations.created_at,
  SUBSTRING(invitations.token, 1, 10) || '...' as token_preview,
  CASE 
    WHEN invitations.expires_at < NOW() THEN 'EXPIRED'
    ELSE 'ACTIVE'
  END as state,
  s.name as space_name
FROM invitations
LEFT JOIN spaces s ON s.id = invitations.space_id
ORDER BY invitations.created_at DESC
LIMIT 5;

