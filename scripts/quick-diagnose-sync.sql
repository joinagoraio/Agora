-- Quick diagnostic: Find the most recent space document and check if it synced

-- 1. Most recent space document
\echo '=== Most Recent Space Document ==='
SELECT 
  id,
  space_id,
  classification,
  visibility,
  payload->>'title' as title,
  payload->>'file_name' as file_name,
  payload->>'mime_type' as mime_type,
  created_at
FROM space_items
WHERE item_type = 'document'
ORDER BY created_at DESC
LIMIT 1;

-- 2. Check if that space has any workspaces
\echo ''
\echo '=== Workspaces for that Space ==='
WITH latest_doc AS (
  SELECT space_id
  FROM space_items
  WHERE item_type = 'document'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  'Direct workspaces' as type,
  w.id,
  w.name,
  w.created_at
FROM workspaces w
JOIN latest_doc ld ON w.space_id = ld.space_id
UNION ALL
SELECT 
  'Linked workspaces' as type,
  w.id,
  w.name,
  w.created_at
FROM workspace_space_links wsl
JOIN workspaces w ON w.id = wsl.workspace_id
JOIN latest_doc ld ON wsl.space_id = ld.space_id;

-- 3. Check if inherited documents were created
\echo ''
\echo '=== Inherited Documents from Latest Space Document ==='
WITH latest_doc AS (
  SELECT id, space_id
  FROM space_items
  WHERE item_type = 'document'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  d.id,
  d.workspace_id,
  d.title,
  d.status,
  d.classification,
  d.metadata->>'sourceSpaceItemId' as source_space_item_id,
  d.created_at
FROM documents d
JOIN latest_doc ld ON d.metadata->>'sourceSpaceItemId' = ld.id::text
WHERE d.metadata->>'origin' = 'space_scope'
ORDER BY d.created_at DESC;

