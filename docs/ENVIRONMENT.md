# Environment Configuration Management

## Overview

This document describes how environment variables are managed across different environments (development, staging, production).

---

## Environment Variables

### Required Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Application secrets
TOKEN_ENCRYPTION_KEY=32+character-secret-used-for-encryption

# OpenAI
OPENAI_API_KEY=sk-...
```

### Optional Variables

```bash
# Redis (for caching/rate limiting)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# App URLs
NEXT_PUBLIC_APP_URL=https://agora.example.com
NEXT_PUBLIC_BASE_URL=https://agora.example.com
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000/auth/callback

# Email (Resend)
RESEND_API_KEY=re_123
INVITE_EMAIL_FROM="Agora <no-reply@agora.example>"

# Error Tracking
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn

# Testing
E2E_BASE_URL=https://agora.example.com
E2E_TEST_EMAIL=test@example.com
E2E_TEST_PASSWORD=test-password
E2E_WORKSPACE_PATH=/workspaces/test-workspace-id
```

---

## Environment-Specific Configuration

### Development

**File:** `.env.local`

```bash
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Staging

Use a second VPS or a separate compose project if you need a preview. GitHub Actions no longer deploys Vercel previews.

### Production

**Files on the Hetzner VPS (not Vercel):**
- `/home/agora/Agora/.env.production`
- `/home/agora/Agora/infrastructure/supabase/.env`

```bash
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://agora.example.com
NEXT_PUBLIC_SUPABASE_URL=https://api.agora.example.com
```

See [Deployment Guide](./DEPLOYMENT.md).

---

## Validation

All environment variables are validated at startup using Zod schemas in `lib/env.ts`.

**Validation Rules:**
- URLs must be valid URLs
- UUIDs must be valid UUIDs
- Required variables must be present
- Optional variables can be omitted
- Redis variables must be provided together

**Error Handling:**
- Application fails fast if validation fails
- Clear error messages indicate missing/invalid variables

---

## Secrets Management

### Local Development

- Use `.env.local` (gitignored)
- Never commit secrets to git
- Use `.env.example` as template

### CI/CD

- Store secrets in GitHub Secrets for tests/builds
- Deploy by rsync + `scripts/deploy/deploy.sh` on the VPS
- Never log secrets in CI/CD output

### Production

- Store `infrastructure/supabase/.env` and `.env.production` only on the VPS and an offline copy
- Rotate secrets regularly
- Use different secrets per environment

---

## Environment Variable Updates

### Adding New Variables

1. Add to `lib/env.ts` schema
2. Add to `.env.example`
3. Update this documentation
4. Set in `.env.production` / `infrastructure/supabase/.env` on the VPS

### Updating Variables

1. Edit `.env.production` or `infrastructure/supabase/.env` on the VPS
2. `bash scripts/deploy/deploy.sh`
3. Verify changes

### Rotating Secrets

1. Generate new secret (`node scripts/deploy/generate-keys.mjs` for a full set)
2. Update the env files on the VPS
3. Redeploy
4. Verify application works
5. Revoke old secret

---

## Best Practices

1. **Never commit secrets** - Use `.env.local` and gitignore
2. **Use different secrets per environment** - Don't share between dev/staging/prod
3. **Rotate regularly** - Update secrets periodically
4. **Validate at startup** - Ensure all required variables present
5. **Document all variables** - Keep this doc updated
6. **Use secure storage** - env files on the VPS plus an offline copy
7. **Limit access** - Only necessary team members

---

## Troubleshooting

### Missing Variables

**Error:** "Environment validation failed"

**Solution:**
1. Check `.env.local` exists
2. Verify all required variables set
3. Check variable names match schema
4. Restart development server

### Invalid Variables

**Error:** "Invalid environment configuration"

**Solution:**
1. Check variable format (URLs, UUIDs, etc.)
2. Verify no typos
3. Check `lib/env.ts` for expected format

### Production Issues

**Error:** Application fails in production

**Solution:**
1. Check `.env.production` and `infrastructure/supabase/.env` on the VPS
2. Verify variables set for the running containers
3. Check variable values are correct
4. Review `docker compose logs`

---

## Security Considerations

- **Never log secrets** - Don't use `console.log` with secrets
- **Use environment-specific values** - Different secrets per environment
- **Rotate regularly** - Update secrets every 90 days
- **Limit access** - Only necessary team members
- **Audit access** - Review who has access regularly

---

## Migration Guide

### Moving from Vercel env vars to the VPS

1. Copy current production values into `.env.production` and `infrastructure/supabase/.env`
2. Generate new JWT/database secrets if you are not restoring a cloud dump that must keep the old keys
3. Deploy with `bash scripts/deploy/deploy.sh`
4. Verify login and document open
5. Remove the Vercel project

---

For more information, see:
- [Deployment Guide](./DEPLOYMENT.md)
- [Developer Guide](./DEVELOPER.md)

