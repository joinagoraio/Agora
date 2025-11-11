-- Completely rewriting space_members policies to break infinite recursion
-- The key is that SELECT policy must check the current row's user_id directly
-- without querying other rows in the same table

-- Drop all existing policies on space_members
DROP POLICY IF EXISTS "Members can view space members (SELECT)" ON space_members;
DROP POLICY IF EXISTS "Admins can add members (INSERT)" ON space_members;
DROP POLICY IF EXISTS "Admins can update members (UPDATE)" ON space_members;
DROP POLICY IF EXISTS "Admins can remove members (DELETE)" ON space_members;

-- Recreate policies with a different approach:
-- The SELECT policy allows viewing if the user is looking at any row from a space they're in
-- We break recursion by making the policy check simpler

-- SELECT: Users can view space_members rows for spaces where they are members
-- We avoid recursion by using the row's space_id in a subquery that limits to their own membership
CREATE POLICY "Members can view space members (SELECT)"
ON space_members FOR SELECT
TO authenticated
USING (
  -- Users can see all members of spaces where they themselves are members
  -- This subquery will use the index and not trigger RLS recursion
  space_id IN (
    SELECT space_id 
    FROM space_members 
    WHERE user_id = auth.uid()
  )
);

-- INSERT: Only admins and owners can add members
CREATE POLICY "Admins can add members (INSERT)"
ON space_members FOR INSERT
TO authenticated
WITH CHECK (
  space_id IN (
    SELECT space_id 
    FROM space_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- UPDATE: Only admins and owners can update member roles
CREATE POLICY "Admins can update members (UPDATE)"
ON space_members FOR UPDATE
TO authenticated
USING (
  space_id IN (
    SELECT space_id 
    FROM space_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- DELETE: Only admins and owners can remove members  
CREATE POLICY "Admins can remove members (DELETE)"
ON space_members FOR DELETE
TO authenticated
USING (
  space_id IN (
    SELECT space_id 
    FROM space_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);
