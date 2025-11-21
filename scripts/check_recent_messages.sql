-- Show the last 10 messages with full details
SELECT 
  role,
  LENGTH(COALESCE(content, '')) as len,
  LEFT(COALESCE(content, '[NULL]'), 100) as preview,
  created_at,
  CASE 
    WHEN content IS NULL THEN '❌ NULL'
    WHEN content = '' THEN '⚠️ EMPTY' 
    WHEN LENGTH(content) > 10 THEN '✅ OK'
    ELSE '⚠️ SHORT'
  END as status
FROM public.messages
ORDER BY created_at DESC
LIMIT 10;

