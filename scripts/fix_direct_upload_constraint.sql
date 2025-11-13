-- Quick fix: Update connector type constraint to allow 'direct_upload'
-- Run this in your Supabase SQL Editor if you haven't run the full migration yet

-- First, drop the existing constraint
ALTER TABLE connectors DROP CONSTRAINT IF EXISTS connectors_type_check;

-- Add the new constraint with 'direct_upload' included
ALTER TABLE connectors 
ADD CONSTRAINT connectors_type_check 
CHECK (type IN ('google_drive', 'notion', 'confluence', 'sharepoint', 'dropbox', 'direct_upload'));
