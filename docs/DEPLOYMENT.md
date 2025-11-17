# Agora Deployment Guide

## Overview

This guide covers deploying the Agora application to production using Vercel, Supabase, and other services.

---

## Prerequisites

- Node.js 20+ installed
- Vercel account
- Supabase project
- Upstash Redis account (optional, for caching/rate limiting)
- OpenAI API key
- GitHub repository (for CI/CD)

---

## Environment Setup

### 1. Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Note your project URL and anon key
3. Get your service role key (Settings → API)

### 2. Database Migrations

Run all migration scripts in order in the Supabase SQL Editor:

```bash
# Run these in order:
scripts/010_extend_spaces_schema.sql
scripts/011_extend_workspaces_schema.sql
scripts/012_create_space_items.sql
scripts/013_create_workspace_space_links.sql
scripts/014_create_workspace_items.sql
scripts/015_extend_documents_schema.sql
scripts/016_create_collaboration_tables.sql
scripts/017_update_rls_for_new_tables.sql
scripts/018_create_search_queries_table.sql
scripts/020_update_user_roles.sql
scripts/027_optimize_query_indexes.sql
```

### 3. Upstash Redis Setup (Optional)

1. Create a Redis database at https://upstash.com
2. Note your REST URL and token
3. Add to environment variables

### 4. OpenAI Setup

1. Get an API key from https://platform.openai.com
2. Add to environment variables

---

## Vercel Deployment

### 1. Connect Repository

1. Go to https://vercel.com
2. Import your GitHub repository
3. Vercel will auto-detect Next.js

### 2. Configure Environment Variables

Add these environment variables in Vercel:

**Required:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-...
```

**Optional (for caching/rate limiting):**
```
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

**Optional (for error tracking):**
```
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn
```

**Optional (for app URLs):**
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

### 3. Build Settings

Vercel will auto-detect:
- **Framework Preset:** Next.js
- **Build Command:** `npm run build` (or `pnpm build`)
- **Output Directory:** `.next`
- **Install Command:** `npm install` (or `pnpm install`)

### 4. Deploy

1. Click "Deploy"
2. Wait for build to complete
3. Your app will be live at `https://your-app.vercel.app`

---

## Post-Deployment

### 1. Verify Health Checks

```bash
curl https://your-app.vercel.app/api/health
curl https://your-app.vercel.app/api/health/live
curl https://your-app.vercel.app/api/health/ready
```

### 2. Test Authentication

1. Visit `https://your-app.vercel.app/auth/sign-up`
2. Create a test account
3. Verify login works

### 3. Configure Supabase Auth

1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Add your Vercel URL to:
   - **Site URL:** `https://your-app.vercel.app`
   - **Redirect URLs:** `https://your-app.vercel.app/auth/callback`

### 4. Set Up Custom Domain (Optional)

1. In Vercel, go to Settings → Domains
2. Add your custom domain
3. Update Supabase redirect URLs to use custom domain

---

## CI/CD Pipeline

### GitHub Actions

The project includes a test workflow (`.github/workflows/test.yml`) that:
- Runs unit tests
- Runs integration tests
- Runs E2E tests (if configured)

### Vercel Integration

Vercel automatically:
- Deploys on push to main branch
- Creates preview deployments for PRs
- Runs build checks

---

## Monitoring Setup

### 1. Health Checks

Set up monitoring for:
- `/api/health/live` - Liveness probe (every 30s)
- `/api/health/ready` - Readiness probe (every 30s)
- `/api/health` - Full health check (every 5min)

### 2. Metrics

Access metrics at `/api/metrics` (protect this endpoint in production):
- JSON format: `?format=json`
- Prometheus format: `?format=prometheus`

### 3. Error Tracking

If using Sentry:
1. Create Sentry project
2. Add `NEXT_PUBLIC_SENTRY_DSN` to environment variables
3. Errors will be automatically tracked

---

## Database Migrations

### Running Migrations

1. Connect to Supabase SQL Editor
2. Run migration scripts in order
3. Verify migrations with:
   ```sql
   SELECT * FROM pg_migrations;
   ```

### Rollback Strategy

1. Keep backup of database before migrations
2. Test migrations in staging first
3. Have rollback scripts ready

---

## Backup & Recovery

### Supabase Backups

Supabase provides:
- Daily automated backups
- Point-in-time recovery (PITR) on paid plans
- Manual backup exports

### Manual Backup

```bash
# Export database schema
pg_dump -h your-db.supabase.co -U postgres -d postgres -s > schema.sql

# Export data
pg_dump -h your-db.supabase.co -U postgres -d postgres -a > data.sql
```

### Recovery

1. Restore from Supabase dashboard, or
2. Run restore script:
   ```bash
   psql -h your-db.supabase.co -U postgres -d postgres < backup.sql
   ```

---

## Scaling

### Horizontal Scaling

Vercel automatically scales:
- Serverless functions scale with traffic
- No configuration needed

### Database Scaling

Supabase scales automatically:
- Connection pooling handles increased load
- Upgrade plan for more resources

### Redis Scaling

Upstash scales automatically:
- No configuration needed
- Pay for what you use

---

## Security Checklist

- [ ] All environment variables set
- [ ] Supabase RLS policies enabled
- [ ] Rate limiting configured
- [ ] CSRF protection enabled
- [ ] HTTPS enforced (Vercel default)
- [ ] Security headers configured
- [ ] Error tracking configured
- [ ] Monitoring set up
- [ ] Backups configured

---

## Troubleshooting

### Build Failures

1. Check build logs in Vercel
2. Verify all environment variables are set
3. Check Node.js version compatibility

### Database Connection Issues

1. Verify Supabase URL and keys
2. Check firewall rules
3. Verify RLS policies

### Rate Limiting Issues

1. Check Upstash Redis connection
2. Verify rate limit configuration
3. Check IP detection (x-forwarded-for header)

### Performance Issues

1. Check database indexes
2. Verify caching is working
3. Monitor API response times
4. Check for N+1 queries

---

## Rollback Procedure

### Vercel Rollback

1. Go to Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"

### Database Rollback

1. Restore from backup
2. Or run rollback migration scripts

---

## Maintenance

### Regular Tasks

- **Weekly:** Review error logs
- **Monthly:** Update dependencies
- **Quarterly:** Review and optimize database indexes
- **As needed:** Security patches

### Updates

1. Test in staging/preview deployment
2. Run database migrations
3. Deploy to production
4. Monitor for issues

---

## Support

For deployment issues:
1. Check Vercel logs
2. Check Supabase logs
3. Review error tracking (Sentry)
4. Contact development team

---

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [API Documentation](./API.md)
- [Architecture Documentation](./ARCHITECTURE.md)

