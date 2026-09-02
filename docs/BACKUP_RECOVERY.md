# Backup & Recovery Procedures

Production backups are taken on the Hetzner VPS. Git remains the backup for application code.

## What to back up

| Asset | How |
|---|---|
| Postgres (including `auth` and `storage` metadata) | `scripts/deploy/backup.sh` → `postgres.dump` |
| Document files | same script → `storage.tar.gz` |
| Secrets | copies of `infrastructure/supabase/.env` and `.env.production` stored off-box |
| Code | Git |

## Nightly backup

On the VPS, as `agora`:

```bash
bash scripts/deploy/backup.sh /home/agora/backups
```

Cron:

```
0 3 * * * /home/agora/Agora/scripts/deploy/backup.sh /home/agora/backups >> /home/agora/backups/cron.log 2>&1
```

Copy `/home/agora/backups` off the box (another volume, another region, or `rclone`).

## Restore Postgres

```bash
bash scripts/deploy/restore-dump.sh /home/agora/backups/<stamp>/postgres.dump
```

## Restore storage files

```bash
docker run --rm \
  -v supabase_storage-data:/target \
  -v /home/agora/backups/<stamp>:/backup \
  alpine tar xzf /backup/storage.tar.gz -C /target
```

Restart `supabase-storage` after restoring files.

## Before schema changes

Take a dump first:

```bash
bash scripts/deploy/backup.sh /home/agora/backups
```

## Cutover from Supabase Cloud (one-time)

```bash
pg_dump "postgresql://postgres.<project>:<password>@db.<project>.supabase.co:5432/postgres" \
  --format=custom --no-owner -f cloud.dump
```

Restore with `restore-dump.sh`. Download Storage objects from the old project if you still need the files.

## Local development

Local `supabase start` is independent. Dump it the same way if you want to seed the VPS:

```bash
pg_dump "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  --format=custom --no-owner -f local.dump
```
