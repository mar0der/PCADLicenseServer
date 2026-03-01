# PCAD CI/CD (Self-Hosted Runner)

This repo uses:

- CI: `.github/workflows/ci.yml` on `ubuntu-latest`
- CD: `.github/workflows/cd.yml` on self-hosted runner labels:
  - `self-hosted`
  - `linux`
  - `the18th`

## 1) Runner Setup (the18th)

Register a new runner for `mar0der/PCADLicenseServer` on `the18th` with label `the18th`.

In GitHub:

1. Open repository settings.
2. Go to `Actions -> Runners`.
3. Click `New self-hosted runner`.
4. Choose Linux x64 and copy the config command.

On `the18th`, run the copied command as `gha-runner` inside a dedicated folder, for example:

```bash
sudo -u gha-runner -H bash -lc '
mkdir -p /opt/github-runners/pcad/actions-runner &&
cd /opt/github-runners/pcad/actions-runner
# download + extract runner package
# run ./config.sh --url ... --token ... --labels the18th
'
```

Install and start service:

```bash
cd /opt/github-runners/pcad/actions-runner
sudo ./svc.sh install gha-runner
sudo ./svc.sh start
```

## 2) Required Server State

- Deploy path exists: `/opt/pcad/site`
- File exists: `/opt/pcad/site/.env.server`
- Docker + Docker Compose installed
- Main proxy already routes `pcad.petarpetkov.com` to `pcad_web:3000`

## 3) Deploy Behavior

`scripts/deploy_pcad.sh` does:

1. Rsync repo to `/opt/pcad/site` (excludes `.git`, `node_modules`, `.next`, temp artifacts).
2. Run:
   - `docker compose -p pcad -f docker-compose.server.yml --env-file .env.server up -d --build`
3. Validate:
   - `http://pcad.petarpetkov.com/` (expects redirect)
   - `https://pcad.petarpetkov.com/login` (expects `200`)

## 4) How To Trigger

- Push to `main` (auto deploy)
- Or run `CD` manually from the GitHub Actions tab (`workflow_dispatch`)
