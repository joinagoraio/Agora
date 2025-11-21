-- Add thinking_duration column to messages table
-- This column stores how long the AI "thought" before responding

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS thinking_duration numeric;

COMMENT ON COLUMN public.messages.thinking_duration IS
  'Duration in seconds that the AI spent "thinking" (processing) before responding';

-- Check the result
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'messages'
  AND column_name = 'thinking_duration';

