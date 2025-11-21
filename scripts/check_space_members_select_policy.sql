-- Check SELECT policies on space_members

SELECT 
  policyname,
  cmd,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'space_members'
  AND cmd = 'SELECT'
ORDER BY policyname;

-- Also check if there are any restrictive policies
SELECT 
  policyname,
  cmd,
  permissive,
  roles
FROM pg_policies
WHERE tablename = 'space_members'
ORDER BY cmd, policyname;

