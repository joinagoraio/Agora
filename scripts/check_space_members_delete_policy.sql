-- Check DELETE policies on space_members table
SELECT 
    policyname,
    cmd,
    CASE 
        WHEN cmd = 'DELETE' THEN '🗑️ DELETE POLICY'
        ELSE cmd::text 
    END as operation,
    using as using_clause,
    with_check
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename = 'space_members'
    AND cmd = 'DELETE'
ORDER BY cmd, policyname;

