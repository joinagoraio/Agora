-- Enable necessary extensions
create extension if not exists "uuid-ossp";
-- Local Supabase / Postgres ships the extension as "vector" (pgvector package).
create extension if not exists "vector";
