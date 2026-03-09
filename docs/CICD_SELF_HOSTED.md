# PCAD CI/CD (Self-Hosted Runner)

This repository deploys to production through GitHub Actions, using a self-hosted runner on `the18th`.

Current production target:

- Domain: `https://pcad.petarpetkov.com`
- Server path: `/opt/pcad/site`
- Compose project: `pcad`
- Runtime container: `pcad_web`
- GitHub repository: `mar0der/PCADLicenseServer`

## Workflow Entry Points

- `push` to `main`: automatic production deploy
- `workflow_dispatch` on `.github/workflows/cd.yml`: manual production deploy from GitHub

CD is pinned to runner labels:

- `self-hosted`
- `Linux`
- `the18th`
- `pcad`

## Runner Requirements

Expected service on `the18th`:

- `actions.runner.mar0der-PCADLicenseServer.pcad-runner.service`

Expected effective runner user:

- `gha-runner`

Expected runner capabilities:

- can read/write `/opt/pcad/site`
- can read/write `/srv/backups/thisServer/pcad.petarpetkov.com/db/predeploy`
- can run Docker and Docker Compose

Runner registration should target this repository and include the `pcad` label. The runner stays on the host; it is not recreated per deploy.

## Required Host State

These items are not stored in git and must exist on `the18th`:

- `/opt/pcad/site/.env.server`
- Docker volume `pcad_pcad_data`
- Docker network `web_network`
- Reverse proxy config routing `pcad.petarpetkov.com` to `pcad_web:3000`
- TLS certs for `pcad.petarpetkov.com`
- Backup root `/srv/backups/thisServer/pcad.petarpetkov.com`

Required production env keys in `/opt/pcad/site/.env.server`:

```dotenv
DATABASE_URL=file:/app/data/dev.db
NEXTAUTH_URL=https://pcad.petarpetkov.com
NEXTAUTH_SECRET=replace-me
PLUGIN_SECRET=replace-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-me
```

`DATABASE_URL` must point at the writable database path mounted from the persistent volume. Production must not rely on a hardcoded fallback inside the image.

## What The Deploy Job Does

`.github/workflows/cd.yml` runs `scripts/deploy_pcad.sh` on the self-hosted runner. The deploy script:

1. Verifies the required production env keys exist.
2. Rsyncs the repo into `/opt/pcad/site`, excluding `.git`, `.github`, `.env.server`, `node_modules`, `.next`, logs, and temp artifacts.
3. Creates a pre-migration database backup:
   - `/srv/backups/thisServer/pcad.petarpetkov.com/db/predeploy/predeploy_*.db.gz`
4. Runs `npx prisma migrate deploy` against the live `DATABASE_URL`.
5. Rebuilds and restarts the single application container:
   - `docker compose -p pcad -f docker-compose.server.yml --env-file .env.server up -d --build`
6. Validates the live container and proxy path with:
   - `/login`
   - `/api/health`
   - `/api/readiness`
   - `/api/version`

`APP_GIT_SHA` is injected by the deploy script so `/api/version` can report the deployed commit.

## First Deploy Bootstrap

The first production setup still requires host access to create the base state:

1. Install Docker / Docker Compose.
2. Create the `gha-runner` user and register the GitHub runner.
3. Create `/opt/pcad/site`.
4. Create `/opt/pcad/site/.env.server`.
5. Create or confirm `web_network`.
6. Configure the reverse proxy and TLS for `pcad.petarpetkov.com`.
7. Ensure backup directories are writable by the runner.

After that bootstrap, normal deploys are repo-driven through GitHub only.

## Smoke Test Commands

These checks reflect the expected steady state after a successful deploy:

```bash
curl -fsS https://pcad.petarpetkov.com/api/health
curl -fsS https://pcad.petarpetkov.com/api/readiness
curl -fsS https://pcad.petarpetkov.com/api/version
curl -fsSIL https://pcad.petarpetkov.com/login
```

If dashboard auth needs to be tested without a browser, use the NextAuth credential flow with a CSRF token and cookie jar.

## Failure Handling

If `prisma migrate deploy` fails, the deploy job stops before the new container rollout completes. Restore is done from:

- `/srv/backups/thisServer/pcad.petarpetkov.com/db/predeploy/`

See `docs/PRODUCTION_WORKFLOW.md` for the full rollback flow.
