-- Local-only: align document_status with app writes (active / archived / deleted).
-- Original 001 enum is processing | ready | error.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'document_status' AND e.enumlabel = 'active'
  ) THEN
    ALTER TYPE public.document_status ADD VALUE 'active';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'document_status' AND e.enumlabel = 'archived'
  ) THEN
    ALTER TYPE public.document_status ADD VALUE 'archived';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'document_status' AND e.enumlabel = 'deleted'
  ) THEN
    ALTER TYPE public.document_status ADD VALUE 'deleted';
  END IF;
END $$;
