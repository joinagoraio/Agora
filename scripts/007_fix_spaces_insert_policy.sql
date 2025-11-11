-- Fix INSERT policy for spaces table
-- The issue is that users need to be able to insert into spaces table

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Users can create spaces (INSERT)" ON spaces;

-- Create proper INSERT policy that allows any authenticated user to create a space
CREATE POLICY "Users can create spaces (INSERT)" ON spaces
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also ensure the space_members INSERT policy allows creating membership records
DROP POLICY IF EXISTS "System can add members (INSERT)" ON space_members;

CREATE POLICY "System can add members (INSERT)" ON space_members
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
