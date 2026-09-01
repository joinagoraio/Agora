# Migration and RLS conventions (Phase 0.3)

1. New scripts: `scripts/NNN_descriptive_name.sql` (next free ≥ 035).  
2. Every tenant-scoped table includes `workspace_id` and/or `tenant_id` (= `spaces.id`).  
3. Enable RLS; policies mirror existing document/workspace membership patterns (`workspace_memberships` / space membership via workspace).  
4. Use `createAdminClient()` only for trusted server paths that already authorize via `requireAuthAndPermission`.  
5. Prefer additive columns (`ADD COLUMN IF NOT EXISTS`) and JSONB for evolving programme metadata until schemas freeze.  
6. Document tenant isolation reasoning in the WP review checklist when shipping RLS.
