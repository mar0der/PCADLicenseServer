# PCAD Production Workflow

This document describes the production deployment model for the hosted PCAD license server.

## Production Model

- App topology: single application container
- Host: `the18th`
- Public domain: `https://pcad.petarpetkov.com`
- Deploy path: `/opt/pcad/site`
- Compose file: `/opt/pcad/site/docker-compose.server.yml`
- Secrets file: `/opt/pcad/site/.env.server`
- Live database: SQLite file inside Docker volume `pcad_pcad_data`
- Reverse proxy: existing shared nginx proxy on `web_network`
- Delivery path: GitHub Actions CD on the self-hosted runner

## What Lives In Git vs On Host

Stored in git:

- application code
- Prisma schema and migrations
- `docker-compose.server.yml`
- `.github/workflows/cd.yml`
- `scripts/deploy_pcad.sh`
- deployment and recovery docs

Stored only on host:

- `/opt/pcad/site/.env.server`
- Docker volume `pcad_pcad_data`
- proxy and TLS config under `/opt/proxy`
- GitHub runner installation and service
- backup archives and backup logs

## Future Change -> Production

Normal path:

1. Make changes on any development machine.
2. Commit and push to GitHub.
3. Merge to `main`.
4. GitHub Actions runs CI.
5. GitHub Actions runs CD on the self-hosted runner on `the18th`.
6. The runner deploys directly on the production host.

Alternative path:

- manually trigger the `CD` workflow from the GitHub Actions UI (`workflow_dispatch`)

Production should be treated as:

- primary deploy trigger: merge or push to `main`
- secondary deploy trigger: manual workflow dispatch

## First Deploy / Host Bootstrap

These steps require direct host access once:

1. Create `/opt/pcad/site`.
2. Create `/opt/pcad/site/.env.server`.
3. Install and register the GitHub self-hosted runner.
4. Install Docker and Docker Compose.
5. Create `web_network`.
6. Configure nginx proxy + TLS for `pcad.petarpetkov.com`.
7. Create backup directories with runner write access.

After bootstrap, routine deploys do not require SSH.

## Production Env Contract

Required keys in `/opt/pcad/site/.env.server`:

```dotenv
DATABASE_URL=file:/app/data/dev.db
NEXTAUTH_URL=https://pcad.petarpetkov.com
NEXTAUTH_SECRET=replace-me
PLUGIN_SECRET=replace-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-me
```

Notes:

- `DATABASE_URL` is explicit and required in production.
- The container does not ship with a production fallback `DATABASE_URL`.
- Live data sits on `/app/data/dev.db` inside the mounted volume.

## Deploy Sequence

`scripts/deploy_pcad.sh` performs the deploy in this order:

1. verify required env keys
2. sync repo into `/opt/pcad/site`
3. create pre-migration DB backup
4. run `prisma migrate deploy` against the live DB
5. rebuild and restart the single app container
6. validate `/login`, `/api/health`, `/api/readiness`, `/api/version`

## Migrations

Create migrations from `web/`:

```bash
npx prisma migrate dev --name your_change_name
```

Commit both:

- `web/prisma/schema.prisma`
- `web/prisma/migrations/*`

On production deploy, the self-hosted runner applies them with:

```bash
npx prisma migrate deploy
```

## Rollback

Pre-migration backup location:

- `/srv/backups/thisServer/pcad.petarpetkov.com/db/predeploy/`

Scheduled backups also exist under:

- `/srv/backups/thisServer/pcad.petarpetkov.com/db/`
- `/srv/backups/thisServer/pcad.petarpetkov.com/files/`
- `/srv/backups/thisServer/pcad.petarpetkov.com/appdata/`

Rollback flow:

1. stop the app container
2. restore the chosen DB backup into Docker volume `pcad_pcad_data`
3. redeploy the known-good commit or run the previous image
4. re-run smoke tests

Rollback still requires host access because the database volume and proxy are host-managed.

## Smoke Tests

Public checks:

```bash
curl -fsS https://pcad.petarpetkov.com/api/health
curl -fsS https://pcad.petarpetkov.com/api/readiness
curl -fsS https://pcad.petarpetkov.com/api/version
curl -fsSIL https://pcad.petarpetkov.com/login
```

Dashboard login verification:

1. fetch a CSRF token from `/api/auth/csrf`
2. submit admin credentials to `/api/auth/callback/credentials`
3. confirm `/dashboard` loads with the authenticated cookie

## What Still Requires Host Access

SSH or console access is still required for:

- first-time bootstrap
- rotating secrets in `/opt/pcad/site/.env.server`
- runner replacement or repair
- proxy/TLS changes
- restoring backups
- disaster recovery when Docker state or the host itself is damaged

Routine code deploys do not require host access once the bootstrap is complete.
