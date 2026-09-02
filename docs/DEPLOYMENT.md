# Agora Deployment Guide

Production is a Hetzner VPS: Caddy (TLS) → Next.js and self-hosted Supabase. Local development is unchanged (`supabase start` + `pnpm dev`).

Do not deploy Agora onto the Sovern box. Use a dedicated CX server.

## What runs on the box

| Piece | Role |
|---|---|
| Caddy | HTTPS for the app domain and the API domain |
| `agora-app` | Next.js (`next start` in Docker) |
| Self-hosted Supabase | Postgres, Auth (GoTrue), Storage, PostgREST, Kong |
| OpenAI / Resend | Stay external |

Hosts:

- `https://$AGORA_APP_DOMAIN` → Next.js
- `https://$AGORA_API_DOMAIN` → Kong (`NEXT_PUBLIC_SUPABASE_URL`)

Studio is the Kong catch-all on the API host, behind the dashboard username/password in `infrastructure/supabase/.env`.

## 1. Create the VPS

1. Hetzner Cloud CX22 or larger, Ubuntu 22.04+, same region as users (FSN/HEL/NBG).
2. DNS A records for the app and API hostnames to the VPS IP. Wait until they resolve before the first Caddy start.
3. From your laptop:

```bash
AGORA_APP_DOMAIN=agora.example.com \
AGORA_API_DOMAIN=api.agora.example.com \
VPS_IP=1.2.3.4 \
bash scripts/deploy/setup-vps.sh
```

That installs Docker, creates the `agora` user, and rsyncs the repo to `/home/agora/Agora`.

## 2. Secrets and env

SSH in:

```bash
ssh agora@1.2.3.4
cd ~/Agora
cp infrastructure/supabase/env.example infrastructure/supabase/.env
cp .env.production.example .env.production
node scripts/deploy/generate-keys.mjs
```

Paste the first block into `infrastructure/supabase/.env` and the second into `.env.production`. Then set:

- `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL`, `ADDITIONAL_REDIRECT_URLS` in the Supabase env
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, domains, `ACME_EMAIL`, `OPENAI_API_KEY`, SMTP (`SMTP_PASS`) in `.env.production` / Supabase env

Auth emails go through GoTrue SMTP (Resend SMTP works: host `smtp.resend.com`, user `resend`, pass = API key).

## 3. Deploy

```bash
bash scripts/deploy/deploy.sh
```

## 4. Data

**Preferred if you already have a working database** (local or old cloud):

```bash
# From the source machine
pg_dump "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  --format=custom --no-owner -f agora.dump

# On the VPS
bash scripts/deploy/restore-dump.sh /path/to/agora.dump
```

**Fresh empty database:** `bash scripts/deploy/apply-schema.sh` (numbered `scripts/0xx_*.sql` in order). Then create the first user through the app.

Copy Storage objects separately if you are moving files: local Docker volume or `supabase storage` from cloud.

## 5. Backups

```bash
bash scripts/deploy/backup.sh /home/agora/backups
```

Cron (nightly 03:00 UTC):

```
0 3 * * * /home/agora/Agora/scripts/deploy/backup.sh /home/agora/backups >> /home/agora/backups/cron.log 2>&1
```

Keep copies off-box. Restore Postgres with `restore-dump.sh`. Storage is `storage.tar.gz` in the same backup folder.

## 6. Redeploy app only

After a git pull / rsync:

```bash
cd ~/Agora
bash scripts/deploy/deploy.sh
```

Supabase stays up; Compose rebuilds the app image.

## 7. Leave Vercel and Supabase Cloud

1. Confirm HTTPS app + login + a document open on Hetzner.
2. Point the public domain at the VPS (if it still pointed at Vercel).
3. Remove the Vercel project and Git integration so `main` no longer deploys there.
4. Pause or delete the hosted Supabase project after you have a verified dump.
5. GitHub Actions no longer deploys to Vercel.

## Local development

Unchanged:

```bash
supabase start
pnpm dev
```

The `infrastructure/` stack is production only.

## GitHub, Vercel, and Hetzner

- **Hetzner** is the new environment. Push to `feat/programme-workbench-guidance` (or `main`) runs `.github/workflows/deploy-hetzner.yml`, which rsyncs the repo and runs `scripts/deploy/deploy.sh`. Env files on the VPS are not overwritten.
- **Vercel** stays as the old comparison site. `vercel.json` sets `git.deploymentEnabled: false` so this branch does not create new Vercel deployments. In the Vercel project, also turn off **Settings → Git → Auto-deploy** (or disconnect the GitHub repo) so a later merge to `main` cannot replace that URL. Do not merge this branch to `main` until that is off.
- Cut over the public hostname to Hetzner when the new version is ready. Then disconnect the Vercel project.

## Optional

Upstash Redis is optional. Without it, rate limits use in-memory fallbacks.

Health:

```bash
curl -fsS https://$AGORA_APP_DOMAIN/api/health
curl -fsS https://$AGORA_API_DOMAIN/auth/v1/health
```
