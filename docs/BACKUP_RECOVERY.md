# Backup & Recovery Procedures

## Overview

This document describes backup and recovery procedures for the Agora application, including database backups, configuration backups, and disaster recovery.

---

## Backup Strategy

### Database Backups

#### Automated Backups (Supabase)

Supabase provides:
- **Daily automated backups** - All plans
- **Point-in-time recovery (PITR)** - Paid plans
- **Manual backup exports** - Available anytime

#### Manual Backups

```bash
# Export full database
pg_dump -h your-db.supabase.co \
  -U postgres \
  -d postgres \
  -F c \
  -f backup_$(date +%Y%m%d_%H%M%S).dump

# Export schema only
pg_dump -h your-db.supabase.co \
  -U postgres \
  -d postgres \
  -s \
  -f schema_$(date +%Y%m%d_%H%M%S).sql

# Export data only
pg_dump -h your-db.supabase.co \
  -U postgres \
  -d postgres \
  -a \
  -f data_$(date +%Y%m%d_%H%M%S).sql
```

### Configuration Backups

#### Environment Variables

1. Export from Vercel Dashboard
2. Store in secure location
3. Document in version control (without values)

#### Application Code

- Git repository serves as backup
- Multiple remotes recommended
- Regular commits

---

## Backup Schedule

### Automated

- **Database:** Daily (Supabase)
- **Code:** Continuous (Git)

### Manual

- **Before major migrations**
- **Before deployments**
- **Weekly full exports** (recommended)

---

## Recovery Procedures

### Database Recovery

#### From Supabase Backup

1. Go to Supabase Dashboard
2. Navigate to Database → Backups
3. Select backup point
4. Restore to new database (test first)
5. Verify data
6. Switch application to restored database

#### From Manual Backup

```bash
# Restore full backup
pg_restore -h your-db.supabase.co \
  -U postgres \
  -d postgres \
  -c \
  backup_20240101_120000.dump

# Restore from SQL file
psql -h your-db.supabase.co \
  -U postgres \
  -d postgres \
  < backup_20240101_120000.sql
```

#### Point-in-Time Recovery

1. Go to Supabase Dashboard
2. Navigate to Database → Backups
3. Select PITR option
4. Choose recovery point
5. Restore to new database
6. Verify and switch

### Application Recovery

#### Code Recovery

```bash
# Clone from Git
git clone https://github.com/your-org/agora.git

# Checkout specific version
git checkout <tag-or-commit>

# Deploy
vercel deploy --prod
```

#### Configuration Recovery

1. Restore environment variables from backup
2. Update in Vercel Dashboard
3. Redeploy application

---

## Disaster Recovery

### Complete System Failure

#### Step 1: Assess Damage

- Database status
- Application status
- Data loss extent
- Recovery point objective (RPO)

#### Step 2: Restore Database

1. Use latest backup
2. Restore to new Supabase project (if needed)
3. Verify data integrity

#### Step 3: Restore Application

1. Deploy from Git
2. Configure environment variables
3. Verify connections
4. Test functionality

#### Step 4: Verify

1. Health checks pass
2. Critical flows work
3. Data integrity verified
4. Performance acceptable

---

## Backup Verification

### Regular Testing

- **Monthly:** Test restore procedure
- **Quarterly:** Full disaster recovery drill
- **After major changes:** Verify backups work

### Verification Checklist

- [ ] Backup file exists
- [ ] Backup file size reasonable
- [ ] Can restore from backup
- [ ] Data integrity verified
- [ ] Application works after restore

---

## Backup Storage

### Locations

1. **Supabase** - Automated backups
2. **Secure cloud storage** - Manual exports
3. **Version control** - Code and configuration (no secrets)

### Retention

- **Daily backups:** 7 days
- **Weekly backups:** 4 weeks
- **Monthly backups:** 12 months
- **Yearly backups:** 7 years

---

## Recovery Time Objectives (RTO)

| Scenario | Target RTO | Actual |
|----------|-----------|--------|
| Code rollback | 5 minutes | ~2 minutes |
| Database rollback | 15 minutes | ~10 minutes |
| Full restore | 1 hour | ~30 minutes |
| Disaster recovery | 4 hours | ~2 hours |

---

## Recovery Point Objectives (RPO)

| Data Type | Target RPO | Actual |
|-----------|-----------|--------|
| Database | 24 hours | 24 hours (daily backup) |
| Code | 0 (Git) | 0 (continuous) |
| Configuration | 24 hours | Manual backup |

---

## Backup Best Practices

1. **Automate backups** - Don't rely on manual
2. **Test regularly** - Verify backups work
3. **Store offsite** - Multiple locations
4. **Encrypt backups** - Protect sensitive data
5. **Document procedures** - Clear recovery steps
6. **Regular drills** - Practice recovery
7. **Monitor backups** - Ensure they run
8. **Version backups** - Keep multiple versions

---

## Backup Checklist

### Before Major Changes

- [ ] Full database backup
- [ ] Configuration backup
- [ ] Code committed to Git
- [ ] Rollback plan prepared

### Regular Maintenance

- [ ] Weekly backup verification
- [ ] Monthly restore test
- [ ] Quarterly disaster drill
- [ ] Backup storage review

---

## Troubleshooting

### Backup Fails

1. Check Supabase status
2. Verify credentials
3. Check storage space
4. Review error logs

### Restore Fails

1. Verify backup file integrity
2. Check database connection
3. Verify permissions
4. Review error messages

### Data Inconsistency

1. Compare backup with current
2. Identify differences
3. Determine cause
4. Restore if needed

---

## Resources

- [Supabase Backups](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL Backup](https://www.postgresql.org/docs/current/backup.html)
- [Vercel Deployments](https://vercel.com/docs/deployments)

---

For more information, see:
- [Deployment Guide](./DEPLOYMENT.md)
- [Rollback Procedures](./ROLLBACK.md)
- [Migration Strategy](./MIGRATIONS.md)

