-- Storage RLS Policies for Documents Bucket
-- Run this in your Supabase SQL Editor after creating the 'documents' storage bucket

-- Enable RLS on storage.objects if not already enabled
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping RLS enable: must run as service_role';
  END;
END;
$$;

-- Drop existing policies if they exist (for idempotency)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Workspace members can upload documents'
  ) THEN
    EXECUTE 'DROP POLICY "Workspace members can upload documents" ON storage.objects';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Workspace members can read documents'
  ) THEN
    EXECUTE 'DROP POLICY "Workspace members can read documents" ON storage.objects';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Workspace members can delete documents'
  ) THEN
    EXECUTE 'DROP POLICY "Workspace members can delete documents" ON storage.objects';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public can read documents'
  ) THEN
    EXECUTE 'DROP POLICY "Public can read documents" ON storage.objects';
  END IF;
END;
$$;

-- Option 1: If bucket is PUBLIC - Allow public reads, workspace members can upload
DO $$
BEGIN
  IF current_user != 'service_role' THEN
    RAISE NOTICE 'Skipping storage policy creation: run as service_role to apply';
    RETURN;
  END IF;

  EXECUTE 'CREATE POLICY "Public can read documents" ON storage.objects FOR SELECT USING (bucket_id = ''documents'')';
  EXECUTE $pol$
    CREATE POLICY "Workspace members can upload documents"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'documents' AND
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE (storage.foldername(name))[1] = 'workspaces'
          AND (storage.foldername(name))[2] = w.id::text
          AND is_workspace_member(w.id, auth.uid())
      )
    );
  $pol$;

  EXECUTE $pol$
    CREATE POLICY "Workspace members can delete documents"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'documents' AND
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE (storage.foldername(name))[1] = 'workspaces'
          AND (storage.foldername(name))[2] = w.id::text
          AND is_workspace_member(w.id, auth.uid())
      )
    );
  $pol$;
END;
$$;

-- Note: For UPDATE, you might want to add a policy if you need to update files
-- For now, we'll skip UPDATE since we're just uploading new files
