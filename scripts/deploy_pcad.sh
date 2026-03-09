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

SITE_SLUG="${SITE_SLUG:-pcad}"
DOMAIN="${DOMAIN:-pcad.petarpetkov.com}"
SERVER_PATH="${SERVER_PATH:-/opt/${SITE_SLUG}/site}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.server.yml}"
ENV_FILE="${ENV_FILE:-.env.server}"
APP_DATA_VOLUME="${APP_DATA_VOLUME:-${SITE_SLUG}_pcad_data}"
PREDEPLOY_KEEP="${PREDEPLOY_KEEP:-20}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_PATH="${SOURCE_PATH:-${GITHUB_WORKSPACE:-$(cd -- "${SCRIPT_DIR}/.." && pwd)}}"

if [[ ! -d "${SOURCE_PATH}" ]]; then
  echo "Source path does not exist: ${SOURCE_PATH}" >&2
  exit 1
fi

mkdir -p "${SERVER_PATH}"

if [[ ! -f "${SERVER_PATH}/${ENV_FILE}" ]]; then
  echo "Missing ${SERVER_PATH}/${ENV_FILE}. Create it first." >&2
  exit 1
fi

get_env_value() {
  local key="$1"
  local env_path="$2"
  local value
  value="$(grep -E "^${key}=" "${env_path}" | tail -n 1 | cut -d= -f2- || true)"

  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:-1}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:-1}"
  fi

  printf '%s' "${value}"
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

ENV_PATH="${SERVER_PATH}/${ENV_FILE}"
for required_key in DATABASE_URL NEXTAUTH_URL NEXTAUTH_SECRET PLUGIN_SECRET ADMIN_USERNAME ADMIN_PASSWORD; do
  if [[ -z "$(get_env_value "${required_key}" "${ENV_PATH}")" ]]; then
    echo "Missing ${required_key} in ${ENV_PATH}" >&2
    exit 1
  fi
done

DATABASE_URL="$(get_env_value "DATABASE_URL" "${ENV_PATH}")"
APP_GIT_SHA="${APP_GIT_SHA:-${GITHUB_SHA:-$(git -C "${SOURCE_PATH}" rev-parse HEAD 2>/dev/null || echo unknown)}}"
export APP_GIT_SHA

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
    -e DATABASE_URL="${DATABASE_URL}" \
    -e PRISMA_HIDE_UPDATE_MESSAGE=1 \
    node:22-alpine sh -lc 'apk add --no-cache libc6-compat >/dev/null && npm ci --no-audit --no-fund >/dev/null && npx prisma migrate deploy'
else
  echo "No prisma migrations found in web/prisma/migrations; skipping migrate deploy"
fi

echo "Starting containers"
docker compose -p "${SITE_SLUG}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build

echo "Compose status"
docker compose -p "${SITE_SLUG}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

echo "Validation (app container)"
ready=0
for _ in $(seq 1 30); do
  if docker compose -p "${SITE_SLUG}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T web \
    node -e 'fetch("http://127.0.0.1:3000/login").then(r=>{console.log("web /login status:",r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))'
  then
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

echo "Validation (app endpoints on container network)"
docker run --rm --network web_network curlimages/curl:8.12.1 -fsS "http://pcad_web:3000/api/health" | sed -n '1,20p'
docker run --rm --network web_network curlimages/curl:8.12.1 -fsS "http://pcad_web:3000/api/readiness" | sed -n '1,20p'
docker run --rm --network web_network curlimages/curl:8.12.1 -fsS "http://pcad_web:3000/api/version" | sed -n '1,20p'

echo "Validation (proxy route on web_network)"
docker run --rm --network web_network curlimages/curl:8.12.1 \
  -fsSI -H "Host: ${DOMAIN}" "http://main_proxy/login" | sed -n '1,12p'

echo "Validation (public endpoint, non-blocking)"
if curl -fsS --max-time 20 "https://${DOMAIN}/api/version" | sed -n '1,20p' && \
  curl -fsSIL --max-time 20 "https://${DOMAIN}/login" | sed -n '1,12p'; then
  echo "Public HTTPS check succeeded"
else
  echo "Warning: public HTTPS check failed from runner host; external access may still be healthy"
fi
