# Production Deployment

This server now has a production deploy path based on:

- `docker-compose.server.yml`
- `scripts/deploy_pcad.sh`
- `.github/workflows/cd.yml`

The production path is fail-closed for critical runtime config. If required secrets or the snapshot private key are missing, the container should exit instead of serving a half-configured app.

## Required Production Env

Create `/opt/pcad/site/.env.server` on the host.

Required values:

- `DATABASE_URL=file:/app/data/dev.db`
- `NEXTAUTH_URL=https://<live-domain>`
- `NEXTAUTH_SECRET=<strong random secret>`
- `PLUGIN_SECRET=<strong random secret>`
- `ADMIN_USERNAME=<admin username>`
- `ADMIN_PASSWORD=<strong admin password>`
- `ACCESS_SNAPSHOT_PRIVATE_KEY_HOST_PATH=/opt/pcad/secrets/access-snapshot.private.pem`

Notes:

- `DATABASE_URL` is mandatory in production. The deploy path and container runtime no longer fall back to an implicit SQLite location.
- The compose file mounts `ACCESS_SNAPSHOT_PRIVATE_KEY_HOST_PATH` into the container at `/run/pcad-secrets/access-snapshot.private.pem`.
- Build metadata (`APP_BUILD_SHA`, `APP_BUILD_TIME_UTC`) is injected by the deploy script and does not need to be stored in `.env.server`.
- Do not leave placeholder/example values in `.env.server`.

## First Deploy

1. Create `/opt/pcad/site/.env.server` from `.env.server.example`.
2. Place the snapshot private key on the server at the host path configured in `ACCESS_SNAPSHOT_PRIVATE_KEY_HOST_PATH`.
3. Ensure Docker and the external `web_network` exist on the target host.
4. Run the `CD` workflow or run `bash scripts/deploy_pcad.sh` on the server.
5. Confirm the smoke checks:
   - container `GET /api/health`
   - container `GET /api/readiness`
   - container `GET /api/version`
   - proxy `GET /api/readiness`
   - Docker health should only turn healthy after `/api/readiness` succeeds
6. Sign in to the dashboard and verify Dokaflex control pages load.

## Normal Redeploy

1. Merge the target change to `main`, or run the `CD` workflow manually.
2. The deploy script will:
   - validate `.env.server`
   - confirm the signing key file exists
   - rsync the repo to `/opt/pcad/site`
   - create a pre-migration DB backup
   - run `prisma migrate deploy`
   - rebuild and restart the container
   - run smoke checks
   - write `.deploy-release` metadata on the host

## DB Backup And Restore

Pre-migration backups are written to:

- `/srv/backups/thisServer/<domain>/db/predeploy`

Restore flow:

1. Stop the app container.
2. Restore the desired backup into the Docker volume:

```bash
gunzip -c /srv/backups/thisServer/<domain>/db/predeploy/<backup>.db.gz | \
  docker run --rm -i -v pcad_pcad_data:/data alpine sh -lc 'cat > /data/dev.db'
```

3. Start the app again with the target code version.

Adjust the volume name if `SITE_SLUG` changes.

## Rollback Flow

Preferred rollback:

1. Run the `CD` workflow manually with `git_ref=<previous-good-commit-or-tag>`.
2. If the failed deploy also changed schema or data in a bad way, restore the matching DB backup first.
3. Redeploy the previous-good ref.
4. Re-run smoke checks on `/api/health`, `/api/readiness`, and `/api/version`.

Use `/opt/pcad/site/.deploy-release` to see the currently deployed build SHA, build time, and the latest backup path recorded by the deploy script.

## Smoke Test Checklist

- `GET /api/health` returns `200`
- `GET /api/readiness` returns `200`
- `GET /api/version` returns build metadata without secrets
- container health is green because readiness passed, not just because the process is alive
- dashboard login works
- Dokaflex Control page loads
- Dokaflex user customization surface loads
- a known local plugin config refresh succeeds against the live base URL when that phase starts

## Dokaflex Live URL Direction

When Dokaflex is switched from localhost to the hosted server, the plugin should point at the live base URL from `NEXTAUTH_URL` for:

- `POST /api/plugin/config/refresh`
- `POST /api/plugin/catalog/sync`
- `POST /api/plugin/usage/batch`

The plugin must keep using the same HMAC request model and the committed public key contract artifacts when validating signed snapshots.
