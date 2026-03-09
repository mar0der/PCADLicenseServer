#!/usr/bin/env bash
set -euo pipefail

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd rsync
need_cmd docker
need_cmd curl
need_cmd gzip
need_cmd awk
need_cmd sed
need_cmd openssl

SITE_SLUG="${SITE_SLUG:-pcad}"
DOMAIN="${DOMAIN:-pcad.petarpetkov.com}"
SERVER_PATH="${SERVER_PATH:-/opt/${SITE_SLUG}/site}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.server.yml}"
ENV_FILE="${ENV_FILE:-.env.server}"
APP_DATA_VOLUME="${APP_DATA_VOLUME:-${SITE_SLUG}_pcad_data}"
PREDEPLOY_KEEP="${PREDEPLOY_KEEP:-20}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_PATH="${SOURCE_PATH:-${GITHUB_WORKSPACE:-$(cd -- "${SCRIPT_DIR}/.." && pwd)}}"
BUILD_TIME_UTC="${APP_BUILD_TIME_UTC:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
BUILD_SHA="${APP_BUILD_SHA:-$(git -C "${SOURCE_PATH}" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)}"
LAST_DB_BACKUP=""

on_error() {
  echo "Deployment failed." >&2
  if [[ -n "${LAST_DB_BACKUP}" ]]; then
    echo "Latest DB backup: ${LAST_DB_BACKUP}" >&2
    echo "Rollback note: redeploy the previous git ref and restore the backup if the schema changed." >&2
  fi
}

trap on_error ERR

if [[ ! -d "${SOURCE_PATH}" ]]; then
  echo "Source path does not exist: ${SOURCE_PATH}" >&2
  exit 1
fi

mkdir -p "${SERVER_PATH}"

if [[ ! -f "${SERVER_PATH}/${ENV_FILE}" ]]; then
  echo "Missing ${SERVER_PATH}/${ENV_FILE}. Create it first." >&2
  exit 1
fi

read_env_file_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $0 ~ /^[[:space:]]*#/ { next }
    $1 == key {
      sub(/^[^=]*=/, "", $0)
      print $0
      exit
    }
  ' "${SERVER_PATH}/${ENV_FILE}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

require_env_file_key() {
  local key="$1"
  local value
  value="$(read_env_file_value "$key")"
  if [[ -z "${value}" ]]; then
    echo "Missing ${key} in ${SERVER_PATH}/${ENV_FILE}" >&2
    exit 1
  fi
}

reject_placeholder_env_file_key() {
  local key="$1"
  local value
  value="$(read_env_file_value "$key")"
  case "${value}" in
    *replace-with*|*generate-a-random*|*your-very-long*|*admin123*|*changeme*|*example*)
      echo "Refusing to deploy with placeholder-like value in ${key}" >&2
      exit 1
      ;;
  esac
}

rotate_keep_latest() {
  local dir="$1"
  local keep="$2"
  local pattern="$3"
  mapfile -t files < <(find "$dir" -maxdepth 1 -type f -name "$pattern" -printf '%T@ %p\n' | sort -nr | awk '{print $2}')
  if (( ${#files[@]} > keep )); then
    printf '%s\0' "${files[@]:$keep}" | xargs -0r rm -f
  fi
}

run_container_smoke_check() {
  local path="$1"
  docker compose -p "${SITE_SLUG}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T web \
    node -e '
      const path = process.argv[1];
      fetch(`http://127.0.0.1:3000${path}`).then(async (response) => {
        const body = await response.text();
        console.log(`${path} status: ${response.status}`);
        console.log(body.slice(0, 300));
        process.exit(response.ok ? 0 : 1);
      }).catch((error) => {
        console.error(error);
        process.exit(1);
      });
    ' "${path}"
}

echo "Validating deploy environment file"
require_env_file_key DATABASE_URL
require_env_file_key NEXTAUTH_URL
require_env_file_key NEXTAUTH_SECRET
require_env_file_key PLUGIN_SECRET
require_env_file_key ADMIN_USERNAME
require_env_file_key ADMIN_PASSWORD
require_env_file_key ACCESS_SNAPSHOT_PRIVATE_KEY_HOST_PATH
reject_placeholder_env_file_key NEXTAUTH_SECRET
reject_placeholder_env_file_key PLUGIN_SECRET
reject_placeholder_env_file_key ADMIN_USERNAME
reject_placeholder_env_file_key ADMIN_PASSWORD

KEY_HOST_PATH="$(read_env_file_value ACCESS_SNAPSHOT_PRIVATE_KEY_HOST_PATH)"
MIGRATION_DATABASE_URL="$(read_env_file_value DATABASE_URL)"
PUBLIC_CONTRACT_PATH="${SOURCE_PATH}/docs/contracts/access-snapshot.public.pem"
if [[ ! -f "${KEY_HOST_PATH}" ]]; then
  echo "Snapshot private key file is missing on the server: ${KEY_HOST_PATH}" >&2
  exit 1
fi
if [[ ! -f "${PUBLIC_CONTRACT_PATH}" ]]; then
  echo "Missing committed public key contract artifact: ${PUBLIC_CONTRACT_PATH}" >&2
  exit 1
fi

HOST_PUBLIC_KEY_SHA="$(openssl pkey -in "${KEY_HOST_PATH}" -pubout -outform DER 2>/dev/null | openssl dgst -sha256 | awk '{print $2}')"
CONTRACT_PUBLIC_KEY_SHA="$(openssl pkey -pubin -in "${PUBLIC_CONTRACT_PATH}" -outform DER 2>/dev/null | openssl dgst -sha256 | awk '{print $2}')"

if [[ -z "${HOST_PUBLIC_KEY_SHA}" || -z "${CONTRACT_PUBLIC_KEY_SHA}" ]]; then
  echo "Failed to derive signing key fingerprints for host/contract validation." >&2
  exit 1
fi

if [[ "${HOST_PUBLIC_KEY_SHA}" != "${CONTRACT_PUBLIC_KEY_SHA}" ]]; then
  echo "Signing key mismatch between ${KEY_HOST_PATH} and ${PUBLIC_CONTRACT_PATH}" >&2
  echo "Host public key sha256: ${HOST_PUBLIC_KEY_SHA}" >&2
  echo "Repo contract sha256: ${CONTRACT_PUBLIC_KEY_SHA}" >&2
  exit 1
fi

echo "Syncing ${SOURCE_PATH} -> ${SERVER_PATH}"
rsync -rlptDz --delete --no-owner --no-group \
  --exclude '.git' \
  --exclude '.github' \
  --exclude '.env.server' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  --exclude 'tmp' \
  --exclude 'web/node_modules' \
  --exclude 'web/.next' \
  --exclude 'web/.env.local' \
  --exclude 'web/keys' \
  "${SOURCE_PATH}/" "${SERVER_PATH}/"

cd "${SERVER_PATH}"

echo "Pre-migration DB backup"
STAMP="$(date +%F_%H%M%S)"
PREDEPLOY_DIR="/srv/backups/thisServer/${DOMAIN}/db/predeploy"
PREDEPLOY_FILE="${PREDEPLOY_DIR}/predeploy_${SITE_SLUG}_${STAMP}.db.gz"
mkdir -p "${PREDEPLOY_DIR}"
docker volume create "${APP_DATA_VOLUME}" >/dev/null

if docker run --rm -v "${APP_DATA_VOLUME}:/data:ro" alpine sh -lc 'test -f /data/dev.db'; then
  docker run --rm -v "${APP_DATA_VOLUME}:/data:ro" alpine sh -lc 'cat /data/dev.db' | gzip -1 > "${PREDEPLOY_FILE}"
  LAST_DB_BACKUP="${PREDEPLOY_FILE}"
  echo "Pre-migration DB backup created: ${PREDEPLOY_FILE}"
  rotate_keep_latest "${PREDEPLOY_DIR}" "${PREDEPLOY_KEEP}" "predeploy_${SITE_SLUG}_*.db.gz"
else
  echo "No existing /data/dev.db in ${APP_DATA_VOLUME}; skipping pre-migration backup"
fi

echo "Prisma migration deploy"
MIGRATIONS_DIR="${SERVER_PATH}/web/prisma/migrations"
if [[ -d "${MIGRATIONS_DIR}" ]] && find "${MIGRATIONS_DIR}" -mindepth 1 -maxdepth 1 -type d | grep -q .; then
  docker run --rm \
    -v "${SERVER_PATH}/web:/workspace" \
    -v "${APP_DATA_VOLUME}:/app/data" \
    -w /workspace \
    -e DATABASE_URL="${MIGRATION_DATABASE_URL}" \
    -e PRISMA_HIDE_UPDATE_MESSAGE=1 \
    node:22-alpine sh -lc 'apk add --no-cache libc6-compat >/dev/null && npm ci --no-audit --no-fund >/dev/null && npx prisma migrate deploy'
else
  echo "No prisma migrations found in web/prisma/migrations; skipping migrate deploy"
fi

echo "Starting containers"
export APP_BUILD_SHA="${BUILD_SHA}"
export APP_BUILD_TIME_UTC="${BUILD_TIME_UTC}"
docker compose -p "${SITE_SLUG}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build

echo "Compose status"
docker compose -p "${SITE_SLUG}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

echo "Validation (container health/readiness)"
ready=0
for _ in $(seq 1 30); do
  if run_container_smoke_check "/api/health" >/dev/null 2>&1 && run_container_smoke_check "/api/readiness" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "${ready}" -ne 1 ]]; then
  echo "App did not become ready in time" >&2
  docker compose -p "${SITE_SLUG}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" logs --tail 100 web || true
  exit 1
fi

run_container_smoke_check "/api/health"
run_container_smoke_check "/api/readiness"
run_container_smoke_check "/api/version"

echo "Validation (proxy route on web_network)"
docker run --rm --network web_network curlimages/curl:8.12.1 \
  -fsS -H "Host: ${DOMAIN}" "http://main_proxy/api/readiness" | sed -n '1,20p'

echo "Validation (public endpoint, non-blocking)"
if curl -fsS --max-time 20 "https://${DOMAIN}/api/version" | sed -n '1,20p'; then
  echo "Public HTTPS version check succeeded"
else
  echo "Warning: public HTTPS version check failed from runner host; external access may still be healthy"
fi

cat > "${SERVER_PATH}/.deploy-release" <<EOF
siteSlug=${SITE_SLUG}
domain=${DOMAIN}
buildSha=${BUILD_SHA}
buildTimeUtc=${BUILD_TIME_UTC}
dbBackup=${LAST_DB_BACKUP}
deployedAtUtc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

echo "Deployment completed"
echo "Release metadata written to ${SERVER_PATH}/.deploy-release"
