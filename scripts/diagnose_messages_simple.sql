-- ============================================================================
-- SIMPLE MESSAGES DIAGNOSTIC
-- ============================================================================

-- Show message counts
SELECT 
  '📊 MESSAGE COUNTS' as diagnostic_section,
  COUNT(*) as total_messages,
  COUNT(CASE WHEN role = 'user' THEN 1 END) as user_messages,
  COUNT(CASE WHEN role = 'assistant' THEN 1 END) as assistant_messages,
  COUNT(CASE WHEN role = 'assistant' AND (content = '' OR content IS NULL) THEN 1 END) as broken_assistant_messages
FROM public.messages;

-- Show recent messages
SELECT 
  '📝 RECENT MESSAGES' as section,
  role,
  LENGTH(COALESCE(content, '')) as content_length,
  LEFT(COALESCE(content, '[EMPTY]'), 60) as content_preview,
  created_at,
  CASE 
    WHEN content = '' OR content IS NULL THEN '❌ BROKEN'
    ELSE '✅ OK'
  END as status
FROM public.messages
ORDER BY created_at DESC
LIMIT 15;

-- Show RLS policies
SELECT 
  '🔒 RLS POLICIES' as section,
  policyname,
  cmd as operation,
  LEFT(COALESCE(qual, 'N/A'), 100) as policy_condition
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'messages'
ORDER BY cmd, policyname;

-- Show messages per conversation
SELECT 
  '💬 MESSAGES PER CONVERSATION' as section,
  c.title as conversation,
  COUNT(m.id) as total,
  COUNT(CASE WHEN m.role = 'user' THEN 1 END) as users,
  COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) as assistants,
  COUNT(CASE WHEN m.role = 'assistant' AND (m.content = '' OR m.content IS NULL) THEN 1 END) as broken,
  MAX(m.created_at) as last_message
FROM public.conversations c
LEFT JOIN public.messages m ON m.conversation_id = c.id
GROUP BY c.id, c.title
ORDER BY last_message DESC NULLS LAST
LIMIT 10;

