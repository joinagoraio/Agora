-- Phase 1 Complete: Run all Amendment A1 Phase 1 migrations
-- This script runs all Phase 1 migrations in order
-- Run this in Supabase SQL Editor after the base schema is set up

-- Note: Run these scripts in order:
-- 1. 010_extend_spaces_schema.sql
-- 2. 011_extend_workspaces_schema.sql
-- 3. 012_create_space_items.sql
-- 4. 013_create_workspace_space_links.sql
-- 5. 014_create_workspace_items.sql
-- 6. 015_extend_documents_schema.sql
-- 7. 016_create_collaboration_tables.sql
-- 8. 017_update_rls_for_new_tables.sql
-- 9. 018_create_search_queries_table.sql

-- This file serves as a checklist/reference
-- Each script is idempotent and can be run multiple times safely

SELECT 'Phase 1 migrations complete. Please run each script individually in order.' AS status;
