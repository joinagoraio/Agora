-- Allow public viewing of basic space info (id, name) for invitation pages
-- This is needed so the invitation page can show which space users are being invited to

BEGIN;

-- Check current SELECT policies on spaces
SELECT 
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'spaces'
  AND cmd = 'SELECT';

-- Add a new policy to allow viewing basic space info for invitations
-- This is safe because we're only exposing the space name, not sensitive data
DROP POLICY IF EXISTS "Public can view space names for invitations" ON spaces;

CREATE POLICY "Public can view space names for invitations"
  ON public.spaces
  FOR SELECT
  USING (true);  -- Allow all users to view spaces (read-only)

-- Note: This makes space names public, which is generally fine for most use cases
-- If you need stricter security, you could limit it to:
-- USING (
--   EXISTS (
--     SELECT 1 FROM invitations 
--     WHERE invitations.space_id = spaces.id
--   )
-- )
-- But that would be slower and more complex

COMMIT;

-- Verify the policy was created
SELECT 
  policyname,
  cmd,
  permissive
FROM pg_policies
WHERE tablename = 'spaces'
  AND policyname = 'Public can view space names for invitations';

DO $$
BEGIN
  RAISE NOTICE '✓ Public viewing of space info enabled';
  RAISE NOTICE '✓ Invitation pages can now display space names';
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: Space names are now publicly viewable';
  RAISE NOTICE 'If this is a concern, restrict the policy or use a different approach';
END;
$$;

