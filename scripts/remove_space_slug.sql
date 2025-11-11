-- Remove slug column from spaces table
-- Since URLs use UUIDs, slugs are no longer needed

ALTER TABLE public.spaces
DROP COLUMN IF EXISTS slug;

-- Remove unique constraint on slug if it exists separately
-- (The constraint should be removed automatically when the column is dropped)

