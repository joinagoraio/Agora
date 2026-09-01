-- Fix space creation via service role: handle_new_space used auth.uid() which is null
-- for admin-client inserts, violating space_members.user_id NOT NULL.

CREATE OR REPLACE FUNCTION public.handle_new_space()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.uid(), NEW.owner_id) IS NULL THEN
    RAISE EXCEPTION 'Cannot create space_members row: both auth.uid() and spaces.owner_id are null';
  END IF;

  INSERT INTO public.space_members (space_id, user_id, role)
  VALUES (NEW.id, coalesce(auth.uid(), NEW.owner_id), 'owner')
  ON CONFLICT (space_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
