# Rollback Procedures

## Overview

This document describes rollback procedures for the Agora application, including code rollbacks, database rollbacks, and emergency procedures.

---

## Code Rollback

### Vercel Rollback

#### Quick Rollback (Recommended)

1. Go to Vercel Dashboard
2. Navigate to Deployments
3. Find previous working deployment
4. Click "..." menu → "Promote to Production"
5. Confirm rollback

**Time:** ~2 minutes

#### Via CLI

```bash
# List deployments
vercel ls

# Promote specific deployment
vercel promote <deployment-url> --prod
```

### GitHub Rollback

If rollback needed before deployment:

```bash
# Revert commit
git revert <commit-hash>

# Push revert
git push origin main
```

---

## Database Rollback

### Using Rollback Scripts

1. **Stop application** (if possible)
2. Open Supabase SQL Editor
3. Run rollback script:
   ```sql
   -- scripts/028_add_new_feature_rollback.sql
   DROP TABLE IF EXISTS public.new_feature CASCADE;
   ```
4. Verify rollback
5. Restart application

### Manual Rollback

If no rollback script exists:

1. **Backup current state** (before rollback)
2. Identify changes to revert
3. Create rollback SQL manually
4. Test in staging first
5. Run in production
6. Verify application works

### Restore from Backup

If rollback script not available:

1. **Stop application**
2. Restore from backup:
   ```bash
   psql -h your-db.supabase.co -U postgres -d postgres < backup.sql
   ```
3. Verify database state
4. Restart application

---

## Environment Variable Rollback

### Vercel

1. Go to Vercel Dashboard → Settings → Environment Variables
2. Revert to previous values
3. Redeploy application

### Local

1. Update `.env.local`
2. Restart development server

---

## Emergency Rollback Procedure

### Step 1: Assess Situation

- Is application down?
- Are users affected?
- What's the severity?

### Step 2: Stop Deployment

- Cancel any in-progress deployments
- Prevent new deployments

### Step 3: Rollback Code

1. Promote previous working deployment in Vercel
2. Verify deployment successful
3. Check application status

### Step 4: Rollback Database (if needed)

1. If database changes caused issues
2. Run rollback script
3. Or restore from backup

### Step 5: Verify

1. Check application health endpoints
2. Test critical user flows
3. Monitor error logs
4. Verify no data loss

### Step 6: Communicate

- Notify team
- Update status page (if applicable)
- Document incident

---

## Rollback Decision Tree

```
Issue Detected
    │
    ├─ Application Down?
    │   ├─ Yes → Emergency Rollback
    │   └─ No → Continue
    │
    ├─ Data Corruption?
    │   ├─ Yes → Database Rollback + Code Rollback
    │   └─ No → Continue
    │
    ├─ Performance Degradation?
    │   ├─ Yes → Code Rollback (check database)
    │   └─ No → Continue
    │
    └─ Feature Broken?
        ├─ Yes → Code Rollback
        └─ No → Monitor
```

---

## Rollback Testing

### Before Production

1. Test rollback in staging
2. Verify rollback scripts work
3. Test emergency procedures
4. Document any issues

### Regular Drills

- Quarterly rollback drills
- Test emergency procedures
- Verify backup/restore
- Update documentation

---

## Prevention

### Before Deployment

- [ ] Test in staging
- [ ] Review changes
- [ ] Check dependencies
- [ ] Verify migrations
- [ ] Test rollback scripts

### During Deployment

- [ ] Monitor deployment
- [ ] Watch error logs
- [ ] Check health endpoints
- [ ] Test critical flows

### After Deployment

- [ ] Monitor for 30 minutes
- [ ] Check error rates
- [ ] Verify performance
- [ ] Test user flows

---

## Rollback Checklist

### Code Rollback

- [ ] Previous deployment identified
- [ ] Rollback tested (if time permits)
- [ ] Team notified
- [ ] Rollback executed
- [ ] Application verified
- [ ] Issue documented

### Database Rollback

- [ ] Current state backed up
- [ ] Rollback script prepared
- [ ] Tested in staging
- [ ] Application stopped (if needed)
- [ ] Rollback executed
- [ ] Database verified
- [ ] Application restarted
- [ ] Functionality verified

---

## Post-Rollback

### Immediate Actions

1. Verify application works
2. Check critical user flows
3. Monitor error logs
4. Notify team of resolution

### Follow-Up

1. Root cause analysis
2. Fix underlying issue
3. Update rollback procedures
4. Document lessons learned

---

## Rollback Scripts

### Location

Rollback scripts should be in `scripts/` directory:

```
scripts/
├── 028_add_new_feature.sql
└── 028_add_new_feature_rollback.sql
```

### Naming Convention

```
XXX_description_rollback.sql
```

### Example

```sql
-- scripts/028_add_new_feature_rollback.sql

-- Rollback: Remove new feature table
-- Run this if migration 028 causes issues

DROP TABLE IF EXISTS public.new_feature CASCADE;
DROP INDEX IF EXISTS idx_new_feature_name;
```

---

## Resources

- [Vercel Rollback](https://vercel.com/docs/deployments/rollback)
- [Supabase Backups](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL Backup/Restore](https://www.postgresql.org/docs/current/backup.html)

---

For more information, see:
- [Deployment Guide](./DEPLOYMENT.md)
- [Migration Strategy](./MIGRATIONS.md)

