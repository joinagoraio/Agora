-- Phase 2: Update User Roles System
-- Maps existing roles to new role system and adds new roles
-- Note: We'll keep backward compatibility with old roles while adding new ones

-- First, let's check if we're using enum or CHECK constraint
DO $$
BEGIN
  -- If using enum type, we need to handle it differently
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- Add new role values to enum if they don't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'tenant_admin' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'tenant_admin';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'org_manager' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'org_manager';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'project_owner' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'project_owner';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'analyst' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'analyst';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'contributor' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'contributor';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'external' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'external';
    END IF;
  END IF;
END $$;

-- Update CHECK constraints if using them instead of enum
DO $$
DECLARE
  constraint_name_space_members TEXT;
  constraint_name_invitations TEXT;
BEGIN
  -- Find the constraint name for space_members.role
  SELECT tc.constraint_name INTO constraint_name_space_members
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
  WHERE tc.table_name = 'space_members'
  AND tc.constraint_type = 'CHECK'
  AND cc.check_clause LIKE '%role%'
  LIMIT 1;

  -- Find the constraint name for invitations.role
  SELECT tc.constraint_name INTO constraint_name_invitations
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
  WHERE tc.table_name = 'invitations'
  AND tc.constraint_type = 'CHECK'
  AND cc.check_clause LIKE '%role%'
  LIMIT 1;

  -- Update space_members constraint if found
  IF constraint_name_space_members IS NOT NULL THEN
    EXECUTE format('ALTER TABLE space_members DROP CONSTRAINT IF EXISTS %I', constraint_name_space_members);
    ALTER TABLE space_members ADD CONSTRAINT space_members_role_check 
      CHECK (role IN (
        'owner', 'admin', 'member', 'viewer',  -- Old roles (backward compatibility)
        'tenant_admin', 'org_manager', 'project_owner', 'analyst', 'contributor', 'external'  -- New roles
      ));
  END IF;
  
  -- Update invitations constraint if found
  IF constraint_name_invitations IS NOT NULL THEN
    EXECUTE format('ALTER TABLE invitations DROP CONSTRAINT IF EXISTS %I', constraint_name_invitations);
    ALTER TABLE invitations ADD CONSTRAINT invitations_role_check 
      CHECK (role IN (
        'admin', 'member', 'viewer',  -- Old roles
        'tenant_admin', 'org_manager', 'project_owner', 'analyst', 'contributor', 'external'  -- New roles
      ));
  END IF;
END $$;

-- Migration: Map existing roles to new system
-- owner -> tenant_admin (keep owner for backward compatibility)
-- admin -> org_manager (keep admin for backward compatibility)
-- member -> contributor (keep member for backward compatibility)
-- viewer -> viewer (unchanged)

-- Note: We're keeping old roles in the database for backward compatibility
-- The application layer will handle the mapping

-- Add comment only if enum type exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    COMMENT ON TYPE user_role IS 'User roles: owner/tenant_admin (full control), admin/org_manager (settings/users), project_owner (workspaces/share), analyst/contributor (evidence/notes), viewer (read-only), external (shared views)';
  END IF;
END $$;
