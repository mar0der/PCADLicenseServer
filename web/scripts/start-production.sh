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

validate_private_key_pem() {
  node -e '
    const crypto = require("node:crypto");
    const fs = require("node:fs");

    const mode = process.argv[1];

    try {
      const pem =
        mode === "path"
          ? fs.readFileSync(process.argv[2], "utf8")
          : process.env.ACCESS_SNAPSHOT_PRIVATE_KEY_PEM || "";

      crypto.createPrivateKey(pem);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  ' "$@"
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
  if ! validate_private_key_pem path "${ACCESS_SNAPSHOT_PRIVATE_KEY_PATH}" >/dev/null 2>&1; then
    echo "Snapshot private key is unreadable or invalid: ${ACCESS_SNAPSHOT_PRIVATE_KEY_PATH}" >&2
    exit 1
  fi
elif ! validate_private_key_pem env >/dev/null 2>&1; then
  echo "Snapshot private key PEM is invalid." >&2
  exit 1
fi

reject_placeholder NEXTAUTH_SECRET
reject_placeholder PLUGIN_SECRET
reject_placeholder ADMIN_USERNAME
reject_placeholder ADMIN_PASSWORD

exec node server.js
