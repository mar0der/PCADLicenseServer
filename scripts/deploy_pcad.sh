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

SITE_SLUG="${SITE_SLUG:-pcad}"
DOMAIN="${DOMAIN:-pcad.petarpetkov.com}"
SERVER_PATH="${SERVER_PATH:-/opt/${SITE_SLUG}/site}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.server.yml}"
ENV_FILE="${ENV_FILE:-.env.server}"

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

echo "Syncing ${SOURCE_PATH} -> ${SERVER_PATH}"
rsync -az --delete \
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

echo "Starting containers"
docker compose -p "${SITE_SLUG}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build

echo "Compose status"
docker compose -p "${SITE_SLUG}" -f "${COMPOSE_FILE}" ps

echo "HTTP/HTTPS validation"
curl -fsSIL --max-time 20 "http://${DOMAIN}/" | sed -n '1,5p'
curl -fsSIL --max-time 20 "https://${DOMAIN}/login" | sed -n '1,12p'
