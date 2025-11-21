-- Comprehensive diagnostic for space document upload sync issues
-- Run this after uploading a document to a space to see what's happening

\echo '========================================'
\echo 'SPACE DOCUMENT SYNC DIAGNOSTIC'
\echo '========================================'
\echo ''

-- 1. Most recent space documents (last 5)
\echo '=== 1. Recent Space Documents ==='
SELECT 
  si.id as space_item_id,
  si.space_id,
  si.classification,
  si.visibility,
  si.payload->>'title' as title,
  si.payload->>'file_name' as file_name,
  CASE 
    WHEN si.classification = 'public' OR si.visibility = 'public' THEN '✓ SHOULD SYNC'
    ELSE '✗ SHOULD NOT SYNC'
  END as sync_expected,
  si.created_at
FROM space_items si
WHERE si.item_type = 'document'
ORDER BY si.created_at DESC
LIMIT 5;

\echo ''
\echo '=== 2. Workspaces that SHOULD receive synced documents ==='
-- For the most recent space document
WITH latest_doc AS (
  SELECT id, space_id
  FROM space_items
  WHERE item_type = 'document'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  'Direct (space_id match)' as link_type,
  w.id as workspace_id,
  w.name as workspace_name,
  w.space_id,
  ld.id as space_item_id
FROM workspaces w
JOIN latest_doc ld ON w.space_id = ld.space_id
UNION ALL
SELECT 
  'Linked (workspace_space_links)' as link_type,
  w.id as workspace_id,
  w.name as workspace_name,
  w.space_id,
  ld.id as space_item_id
FROM workspace_space_links wsl
JOIN workspaces w ON w.id = wsl.workspace_id
JOIN latest_doc ld ON wsl.space_id = ld.space_id;

\echo ''
\echo '=== 3. Inherited Documents ACTUALLY created ==='
-- Check if documents were created in workspaces
WITH latest_doc AS (
  SELECT id, space_id
  FROM space_items
  WHERE item_type = 'document'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  d.id as document_id,
  d.workspace_id,
  d.title,
  d.status,
  d.classification,
  d.source_id,
  d.metadata->>'sourceSpaceItemId' as source_space_item_id,
  d.metadata->>'origin' as origin,
  d.created_at
FROM documents d
JOIN latest_doc ld ON d.metadata->>'sourceSpaceItemId' = ld.id::text
WHERE d.metadata->>'origin' = 'space_scope'
ORDER BY d.created_at DESC;

\echo ''
\echo '=== 4. Missing Syncs (Should exist but dont) ==='
-- Find documents that should be synced but aren't
WITH latest_doc AS (
  SELECT id, space_id, classification, visibility
  FROM space_items
  WHERE item_type = 'document'
  ORDER BY created_at DESC
  LIMIT 1
),
should_sync AS (
  SELECT * FROM latest_doc
  WHERE classification = 'public' OR visibility = 'public'
),
target_workspaces AS (
  SELECT DISTINCT
    ss.id as space_item_id,
    COALESCE(w.id, wsl.workspace_id) as workspace_id,
    ss.space_id
  FROM should_sync ss
  LEFT JOIN workspaces w ON w.space_id = ss.space_id
  LEFT JOIN workspace_space_links wsl ON wsl.space_id = ss.space_id
  WHERE COALESCE(w.id, wsl.workspace_id) IS NOT NULL
),
existing_docs AS (
  SELECT DISTINCT
    d.metadata->>'sourceSpaceItemId' as space_item_id,
    d.workspace_id
  FROM documents d
  JOIN latest_doc ld ON d.metadata->>'sourceSpaceItemId' = ld.id::text
  WHERE d.status = 'active'
    AND d.metadata->>'origin' = 'space_scope'
)
SELECT 
  tw.space_id,
  tw.workspace_id,
  tw.space_item_id,
  '✗ MISSING - Should be synced!' as status
FROM target_workspaces tw
LEFT JOIN existing_docs ed 
  ON ed.space_item_id = tw.space_item_id::text
  AND ed.workspace_id = tw.workspace_id
WHERE ed.space_item_id IS NULL;

\echo ''
\echo '=== 5. Check Sources for Workspaces ==='
-- Check if each workspace has a 'workspace_generated' source
WITH latest_doc AS (
  SELECT space_id
  FROM space_items
  WHERE item_type = 'document'
  ORDER BY created_at DESC
  LIMIT 1
),
target_workspaces AS (
  SELECT DISTINCT w.id, w.name
  FROM workspaces w
  JOIN latest_doc ld ON w.space_id = ld.space_id
  UNION
  SELECT DISTINCT w.id, w.name
  FROM workspace_space_links wsl
  JOIN workspaces w ON w.id = wsl.workspace_id
  JOIN latest_doc ld ON wsl.space_id = ld.space_id
)
SELECT 
  tw.id as workspace_id,
  tw.name as workspace_name,
  CASE 
    WHEN s.id IS NOT NULL THEN '✓ Has workspace_generated source'
    ELSE '✗ MISSING workspace_generated source'
  END as source_status,
  s.id as source_id,
  s.status as source_status_value
FROM target_workspaces tw
LEFT JOIN sources s ON s.workspace_id = tw.id AND s.type = 'workspace_generated';

\echo ''
\echo '=== 6. Check RLS Policies on documents table ==='
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN roles::text LIKE '%service_role%' THEN '✓ Allows service_role'
    ELSE '✗ May block service_role'
  END as service_role_access,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'documents'
  AND cmd IN ('INSERT', 'ALL')
ORDER BY policyname;

\echo ''
\echo '========================================'
\echo 'END OF DIAGNOSTIC'
\echo '========================================'

