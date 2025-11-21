-- Diagnostic script to understand space document syncing issues
-- This script helps diagnose why documents uploaded to a space aren't syncing to workspaces

-- 1. Check the most recent space documents
SELECT 
  'Recent Space Documents' as check_type,
  si.id,
  si.space_id,
  si.item_type,
  si.classification,
  si.visibility,
  si.payload->>'title' as title,
  si.payload->>'file_name' as file_name,
  si.payload->>'mime_type' as mime_type,
  si.created_at
FROM space_items si
WHERE si.item_type = 'document'
ORDER BY si.created_at DESC
LIMIT 10;

-- 2. Check workspaces linked to each space (last 5 spaces with documents)
WITH recent_space_docs AS (
  SELECT DISTINCT space_id 
  FROM space_items 
  WHERE item_type = 'document'
  ORDER BY space_id DESC
  LIMIT 5
)
SELECT 
  'Workspaces per Space' as check_type,
  s.id as space_id,
  s.name as space_name,
  COUNT(DISTINCT w.id) as direct_workspaces,
  COUNT(DISTINCT wsl.workspace_id) as linked_workspaces,
  COUNT(DISTINCT w.id) + COUNT(DISTINCT wsl.workspace_id) as total_workspaces
FROM spaces s
LEFT JOIN workspaces w ON w.space_id = s.id
LEFT JOIN workspace_space_links wsl ON wsl.space_id = s.id
WHERE s.id IN (SELECT space_id FROM recent_space_docs)
GROUP BY s.id, s.name
ORDER BY s.id DESC;

-- 3. Check inherited documents (documents with origin = 'space_scope')
SELECT 
  'Inherited Documents' as check_type,
  d.id,
  d.workspace_id,
  d.title,
  d.classification,
  d.metadata->>'origin' as origin,
  d.metadata->>'sourceSpaceId' as source_space_id,
  d.metadata->>'sourceSpaceItemId' as source_space_item_id,
  d.metadata->>'type' as mime_type,
  d.created_at
FROM documents d
WHERE d.metadata->>'origin' = 'space_scope'
ORDER BY d.created_at DESC
LIMIT 10;

-- 4. Find space documents that should be synced but haven't been
WITH syncable_space_docs AS (
  SELECT 
    si.id as space_item_id,
    si.space_id,
    si.payload->>'title' as title,
    si.classification,
    si.visibility
  FROM space_items si
  WHERE si.item_type = 'document'
    AND (si.classification = 'public' OR si.visibility = 'public')
),
target_workspaces AS (
  SELECT DISTINCT
    ssd.space_item_id,
    ssd.space_id,
    ssd.title,
    COALESCE(w.id, wsl.workspace_id) as workspace_id
  FROM syncable_space_docs ssd
  LEFT JOIN workspaces w ON w.space_id = ssd.space_id
  LEFT JOIN workspace_space_links wsl ON wsl.space_id = ssd.space_id
  WHERE COALESCE(w.id, wsl.workspace_id) IS NOT NULL
),
existing_inherited_docs AS (
  SELECT DISTINCT
    d.metadata->>'sourceSpaceItemId' as space_item_id,
    d.workspace_id
  FROM documents d
  WHERE d.metadata->>'origin' = 'space_scope'
    AND d.status = 'active'
)
SELECT 
  'Missing Inherited Documents' as check_type,
  tw.space_id,
  tw.workspace_id,
  tw.space_item_id,
  tw.title,
  'Should be synced but not found' as status
FROM target_workspaces tw
LEFT JOIN existing_inherited_docs eid 
  ON eid.space_item_id = tw.space_item_id 
  AND eid.workspace_id = tw.workspace_id
WHERE eid.space_item_id IS NULL
ORDER BY tw.space_id, tw.workspace_id
LIMIT 20;

-- 5. Check RLS policies that might be blocking document creation
SELECT 
  'RLS Policies on documents' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'documents'
  AND (cmd = 'INSERT' OR cmd = 'ALL')
ORDER BY policyname;

