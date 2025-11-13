-- Add thinking_duration column to messages table
-- This stores how long the AI "thought" (time between request and response start) in seconds

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS thinking_duration NUMERIC(10, 2);

-- Add comment for documentation
COMMENT ON COLUMN messages.thinking_duration IS 'Time in seconds between request start and response streaming start';

