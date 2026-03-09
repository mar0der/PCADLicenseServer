import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  detectRuntimeMode,
  validateServerRuntimeEnv,
} from "../src/lib/runtime/config";
import {
  buildHealthStatus,
  buildReadinessStatus,
  buildVersionStatus,
  httpStatusFromReadiness,
} from "../src/lib/runtime/status";

test("detectRuntimeMode follows the server node environment", () => {
  assert.equal(detectRuntimeMode({ NODE_ENV: "production" }), "production");
  assert.equal(detectRuntimeMode({ NODE_ENV: "test" }), "test");
  assert.equal(detectRuntimeMode({ NODE_ENV: "development" }), "development");
  assert.equal(detectRuntimeMode({}), "development");
});

test("validateServerRuntimeEnv accepts a complete production config", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pcad-runtime-"));
  const privateKeyPath = path.join(tempDir, "access-snapshot.private.pem");
  fs.writeFileSync(privateKeyPath, "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n");

  const report = validateServerRuntimeEnv(
    {
      NODE_ENV: "production",
      DATABASE_URL: "file:/app/data/dev.db",
      NEXTAUTH_URL: "https://pcad.example.com",
      NEXTAUTH_SECRET: "super-secret-nextauth-value",
      PLUGIN_SECRET: "super-secret-plugin-value",
      ADMIN_USERNAME: "pcad-admin",
      ADMIN_PASSWORD: "super-secret-admin-password",
      ACCESS_SNAPSHOT_PRIVATE_KEY_PATH: privateKeyPath,
    },
    {
      cwd: tempDir,
    }
  );

  assert.equal(report.isValidForStartup, true);
  assert.deepEqual(report.issues, []);
  assert.equal(report.summary.nextAuthConfigured, true);
  assert.equal(report.summary.pluginAuthConfigured, true);
  assert.equal(report.summary.adminAuthConfigured, true);
  assert.equal(report.summary.accessSnapshotSigningConfigured, true);
});

test("validateServerRuntimeEnv fails closed for missing and placeholder production values", () => {
  const report = validateServerRuntimeEnv({
    NODE_ENV: "production",
    DATABASE_URL: "",
    NEXTAUTH_URL: "http://pcad.example.com",
    NEXTAUTH_SECRET: "replace-with-strong-random-secret",
    PLUGIN_SECRET: "your-very-long-and-secure-random-string",
    ADMIN_USERNAME: "replace-with-admin-username",
    ADMIN_PASSWORD: "admin123",
  });

  assert.equal(report.isValidForStartup, false);
  assert.deepEqual(
    report.issues.map((issue) => issue.code),
    [
      "DATABASE_URL_MISSING",
      "ACCESS_SNAPSHOT_PRIVATE_KEY_MISSING",
      "NEXTAUTH_URL_NOT_HTTPS",
      "NEXTAUTH_SECRET_PLACEHOLDER",
      "PLUGIN_SECRET_PLACEHOLDER",
      "ADMIN_PASSWORD_PLACEHOLDER",
      "ADMIN_USERNAME_PLACEHOLDER",
    ]
  );
});

test("health and version payloads expose build info without secret material", () => {
  const env = {
    NODE_ENV: "production",
    APP_BUILD_SHA: "abc123def456",
    APP_BUILD_TIME_UTC: "2026-03-09T09:45:00Z",
    NEXTAUTH_SECRET: "do-not-leak",
    PLUGIN_SECRET: "do-not-leak",
  };

  const health = buildHealthStatus(env, {
    cwd: process.cwd(),
    now: new Date("2026-03-09T10:00:00Z"),
  });
  const version = buildVersionStatus(env, {
    cwd: process.cwd(),
    now: new Date("2026-03-09T10:00:00Z"),
  });

  assert.equal(health.status, "ok");
  assert.equal(health.checkedAtUtc, "2026-03-09T10:00:00Z");
  assert.equal(health.build.buildSha, "abc123def456");
  assert.equal(version.build.buildTimeUtc, "2026-03-09T09:45:00Z");
  assert.equal(JSON.stringify(health).includes("do-not-leak"), false);
  assert.equal(JSON.stringify(version).includes("do-not-leak"), false);
});

test("readiness returns not_ready when runtime config is invalid", async () => {
  const readiness = await buildReadinessStatus({
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "file:/app/data/dev.db",
    },
    now: new Date("2026-03-09T10:15:00Z"),
  });

  assert.equal(readiness.status, "not_ready");
  assert.equal(readiness.checkedAtUtc, "2026-03-09T10:15:00Z");
  assert.equal(readiness.checks.runtimeConfig, "failed");
  assert.equal(readiness.checks.database, "skipped");
  assert.equal(httpStatusFromReadiness(readiness), 503);
});

test("readiness returns ready only when runtime config and database checks succeed", async () => {
  const readiness = await buildReadinessStatus({
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "file:/app/data/dev.db",
      NEXTAUTH_URL: "https://pcad.example.com",
      NEXTAUTH_SECRET: "super-secret-nextauth-value",
      PLUGIN_SECRET: "super-secret-plugin-value",
      ADMIN_USERNAME: "pcad-admin",
      ADMIN_PASSWORD: "super-secret-admin-password",
      ACCESS_SNAPSHOT_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----",
    },
    now: new Date("2026-03-09T10:30:00Z"),
    databaseCheck: async () => undefined,
  });

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.checks.runtimeConfig, "ok");
  assert.equal(readiness.checks.database, "ok");
  assert.equal(readiness.issues.length, 0);
  assert.equal(httpStatusFromReadiness(readiness), 200);
});

test("readiness reports database failures without leaking internals", async () => {
  const readiness = await buildReadinessStatus({
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "file:/app/data/dev.db",
      NEXTAUTH_URL: "https://pcad.example.com",
      NEXTAUTH_SECRET: "super-secret-nextauth-value",
      PLUGIN_SECRET: "super-secret-plugin-value",
      ADMIN_USERNAME: "pcad-admin",
      ADMIN_PASSWORD: "super-secret-admin-password",
      ACCESS_SNAPSHOT_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----",
    },
    databaseCheck: async () => {
      throw new Error("sqlite is locked");
    },
  });

  assert.equal(readiness.status, "not_ready");
  assert.equal(readiness.checks.runtimeConfig, "ok");
  assert.equal(readiness.checks.database, "failed");
  assert.deepEqual(readiness.issues, ["Database connection check failed."]);
});
