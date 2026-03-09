#!/usr/bin/env sh
set -eu

require_env() {
  key="$1"
  value="$(printenv "$key" 2>/dev/null || true)"
  if [ -z "$value" ]; then
    echo "Missing required production environment variable: $key" >&2
    exit 1
  fi
}

reject_placeholder() {
  key="$1"
  value="$(printenv "$key" 2>/dev/null || true)"
  case "$value" in
    *replace-with*|*generate-a-random*|*your-very-long*|*admin123*|*changeme*|*example*)
      echo "Refusing to start with placeholder-like value in $key" >&2
      exit 1
      ;;
  esac
}

require_env DATABASE_URL
require_env NEXTAUTH_URL
require_env NEXTAUTH_SECRET
require_env PLUGIN_SECRET
require_env ADMIN_USERNAME
require_env ADMIN_PASSWORD

if [ -z "${ACCESS_SNAPSHOT_PRIVATE_KEY_PEM:-}" ]; then
  require_env ACCESS_SNAPSHOT_PRIVATE_KEY_PATH
  if [ ! -f "${ACCESS_SNAPSHOT_PRIVATE_KEY_PATH}" ]; then
    echo "Snapshot private key file not found: ${ACCESS_SNAPSHOT_PRIVATE_KEY_PATH}" >&2
    exit 1
  fi
fi

reject_placeholder NEXTAUTH_SECRET
reject_placeholder PLUGIN_SECRET
reject_placeholder ADMIN_USERNAME
reject_placeholder ADMIN_PASSWORD

exec node server.js
