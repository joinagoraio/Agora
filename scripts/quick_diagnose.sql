-- Quick diagnostic for space document sync issue
-- Run this after trying to upload a document

-- 1. Most recent space document
SELECT 
  '=== Latest Space Document ===' as section,
  id as space_item_id,
  space_id,
  classification,
  visibility,
  payload->>'title' as title,
  CASE 
    WHEN classification = 'public' OR visibility = 'public' THEN 'YES - should sync'
    ELSE 'NO - should not sync'
  END as should_sync,
  created_at
FROM space_items
WHERE item_type = 'document'
ORDER BY created_at DESC
LIMIT 1;

-- 2. Workspaces that should receive it
WITH latest AS (
  SELECT id, space_id
  FROM space_items
  WHERE item_type = 'document'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  '=== Workspaces That Should Receive It ===' as section,
  w.id as workspace_id,
  w.name as workspace_name,
  'Direct (workspace.space_id matches)' as link_type
FROM workspaces w
JOIN latest l ON w.space_id = l.space_id
UNION ALL
SELECT 
  '=== Workspaces That Should Receive It ===' as section,
  w.id as workspace_id,
  w.name as workspace_name,
  'Linked (via workspace_space_links)' as link_type
FROM workspace_space_links wsl
JOIN workspaces w ON w.id = wsl.workspace_id
JOIN latest l ON wsl.space_id = l.space_id;

-- 3. Inherited documents that were actually created
WITH latest AS (
  SELECT id, space_id
  FROM space_items
  WHERE item_type = 'document'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  '=== Inherited Documents Created ===' as section,
  d.id as document_id,
  d.workspace_id,
  d.title,
  d.status,
  d.source_id,
  d.metadata->>'origin' as origin,
  d.metadata->>'sourceSpaceItemId' as source_space_item_id,
  d.created_at
FROM documents d
JOIN latest l ON d.metadata->>'sourceSpaceItemId' = l.id::text
WHERE d.metadata->>'origin' = 'space_scope'
ORDER BY d.created_at DESC;

-- 4. Check if workspaces have workspace_generated sources
WITH latest AS (
  SELECT space_id
  FROM space_items
  WHERE item_type = 'document'
  ORDER BY created_at DESC
  LIMIT 1
),
target_workspaces AS (
  SELECT DISTINCT w.id, w.name
  FROM workspaces w
  JOIN latest l ON w.space_id = l.space_id
  UNION
  SELECT DISTINCT w.id, w.name
  FROM workspace_space_links wsl
  JOIN workspaces w ON w.id = wsl.workspace_id
  JOIN latest l ON wsl.space_id = l.space_id
)
SELECT 
  '=== Workspace Sources ===' as section,
  tw.id as workspace_id,
  tw.name as workspace_name,
  CASE 
    WHEN s.id IS NOT NULL THEN 'HAS workspace_generated source'
    ELSE 'MISSING workspace_generated source'
  END as status,
  s.id as source_id
FROM target_workspaces tw
LEFT JOIN sources s ON s.workspace_id = tw.id AND s.type = 'workspace_generated';

