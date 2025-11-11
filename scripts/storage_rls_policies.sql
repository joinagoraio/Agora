-- Storage RLS Policies for Documents Bucket
-- Run this in your Supabase SQL Editor after creating the 'documents' storage bucket

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Workspace members can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can read documents" ON storage.objects;

-- Option 1: If bucket is PUBLIC - Allow public reads, workspace members can upload
CREATE POLICY "Public can read documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents');

CREATE POLICY "Workspace members can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM workspaces w
    JOIN space_members sm ON sm.space_id = w.space_id
    WHERE (storage.foldername(name))[1] = 'workspaces'
    AND (storage.foldername(name))[2] = w.id::text
    AND sm.user_id = auth.uid()
  )
);

CREATE POLICY "Workspace members can delete documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM workspaces w
    JOIN space_members sm ON sm.space_id = w.space_id
    WHERE (storage.foldername(name))[1] = 'workspaces'
    AND (storage.foldername(name))[2] = w.id::text
    AND sm.user_id = auth.uid()
  )
);

-- Note: For UPDATE, you might want to add a policy if you need to update files
-- For now, we'll skip UPDATE since we're just uploading new files

