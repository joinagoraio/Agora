-- Quick check: Are assistant messages being saved?
SELECT 
  role,
  COUNT(*) as count,
  COUNT(CASE WHEN content = '' OR content IS NULL THEN 1 END) as empty_or_null,
  COUNT(CASE WHEN LENGTH(content) > 0 THEN 1 END) as has_content
FROM public.messages
GROUP BY role;

