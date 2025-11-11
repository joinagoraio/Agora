# AGORA Database Setup Instructions

## Quick Setup

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/_/sql
2. Open the SQL Editor
3. Copy the entire contents of `scripts/complete_migration.sql`
4. Paste and click "Run"
5. Wait for completion (should take 5-10 seconds)

## What This Creates

- ✅ 11 tables with proper relationships
- ✅ Row Level Security (RLS) on all tables
- ✅ Comprehensive security policies for multi-tenant isolation
- ✅ Indexes for optimal query performance
- ✅ Triggers for automatic timestamp updates
- ✅ Auto-profile creation on user signup
- ✅ Vector search support for RAG (requires pgvector extension)

## Verify Installation

After running the migration, you can verify it worked by running:

\`\`\`sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
\`\`\`

You should see 11 tables:
- connectors
- conversations
- document_embeddings
- documents
- invitations
- messages
- profiles
- shared_links
- space_members
- spaces
- workspaces

## Troubleshooting

### Error: "extension vector does not exist"
The pgvector extension may not be enabled. Run:
\`\`\`sql
CREATE EXTENSION IF NOT EXISTS vector;
\`\`\`

### Error: "permission denied"
Make sure you're using the SQL Editor in Supabase Dashboard, not a client connection.

### Tables already exist
If you need to reset, you can drop all tables and re-run:
\`\`\`sql
DROP TABLE IF EXISTS shared_links CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS document_embeddings CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS connectors CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS space_members CASCADE;
DROP TABLE IF EXISTS spaces CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
\`\`\`

Then run the complete_migration.sql again.
