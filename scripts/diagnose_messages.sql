-- ============================================================================
-- DIAGNOSE MESSAGES TABLE AND RLS POLICIES
-- ============================================================================
-- This script helps diagnose why assistant messages might not be visible
-- after page refresh

-- 1. Check if messages table exists and has data
SELECT '===================================================================================' as info;
SELECT '1. MESSAGES TABLE STATUS' as info;
SELECT '===================================================================================' as info;

SELECT 
  COUNT(*) as total_messages,
  COUNT(CASE WHEN role = 'user' THEN 1 END) as user_messages,
  COUNT(CASE WHEN role = 'assistant' THEN 1 END) as assistant_messages,
  COUNT(CASE WHEN content = '' THEN 1 END) as empty_messages,
  COUNT(CASE WHEN content IS NULL THEN 1 END) as null_content_messages
FROM public.messages;

-- 2. Recent Messages (last 10)
SELECT '===================================================================================' as info;
SELECT '2. RECENT MESSAGES (Last 10)' as info;
SELECT '===================================================================================' as info;

SELECT 
  id,
  conversation_id,
  role,
  LENGTH(content) as content_length,
  LEFT(content, 50) as content_preview,
  created_at,
  CASE 
    WHEN content = '' THEN '⚠️  EMPTY'
    WHEN content IS NULL THEN '❌ NULL'
    ELSE '✅ OK'
  END as status
FROM public.messages
ORDER BY created_at DESC
LIMIT 10;

-- 3. Messages Table RLS Status
SELECT '===================================================================================' as info;
SELECT '3. MESSAGES TABLE RLS STATUS' as info;
SELECT '===================================================================================' as info;

SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'messages';

-- 4. Active RLS Policies on Messages
SELECT '===================================================================================' as info;
SELECT '4. ACTIVE RLS POLICIES ON MESSAGES' as info;
SELECT '===================================================================================' as info;

SELECT 
  policyname as policy_name,
  cmd as operation,
  CASE 
    WHEN qual IS NOT NULL THEN LEFT(qual, 80)
    ELSE 'N/A'
  END as using_clause,
  CASE 
    WHEN with_check IS NOT NULL THEN LEFT(with_check, 80)
    ELSE 'N/A'
  END as with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'messages'
ORDER BY cmd, policyname;

-- 5. Check for Orphaned Placeholder Messages
SELECT '===================================================================================' as info;
SELECT '5. ORPHANED PLACEHOLDER MESSAGES' as info;
SELECT '===================================================================================' as info;

SELECT 
  m.id,
  m.conversation_id,
  m.role,
  COALESCE(m.content, '[NULL]') as content,
  m.created_at,
  c.title as conversation_title
FROM public.messages m
LEFT JOIN public.conversations c ON c.id = m.conversation_id
WHERE m.role = 'assistant'
  AND (m.content = '' OR m.content IS NULL)
ORDER BY m.created_at DESC
LIMIT 10;

-- 6. Messages Per Conversation (top 10)
SELECT '===================================================================================' as info;
SELECT '6. MESSAGES PER CONVERSATION (Top 10)' as info;
SELECT '===================================================================================' as info;

SELECT 
  c.id as conversation_id,
  c.title,
  c.user_id,
  COUNT(m.id) as total_messages,
  COUNT(CASE WHEN m.role = 'user' THEN 1 END) as user_messages,
  COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) as assistant_messages,
  MAX(m.created_at) as last_message_at
FROM public.conversations c
LEFT JOIN public.messages m ON m.conversation_id = c.id
GROUP BY c.id, c.title, c.user_id
ORDER BY last_message_at DESC NULLS LAST
LIMIT 10;

-- SUMMARY
SELECT '===================================================================================' as info;
SELECT 'DIAGNOSTIC COMPLETE' as info;
SELECT '===================================================================================' as info;
SELECT 'If you see:' as info;
SELECT '  - Empty or NULL assistant messages → Streaming completion failed' as info;
SELECT '  - No assistant messages at all → RLS policy blocking inserts/updates' as info;
SELECT '  - Messages exist but not visible in app → RLS policy blocking SELECT' as info;
SELECT '===================================================================================' as info;

