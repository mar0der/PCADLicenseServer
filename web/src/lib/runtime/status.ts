import fs from "node:fs";
import path from "node:path";

import { validateServerRuntimeEnv } from "./config";

export type BuildInfo = {
  service: "pcad-license-server";
  appVersion: string;
  buildSha: string | null;
  buildTimeUtc: string | null;
  nodeEnv: string;
};

export type HealthStatusPayload = {
  status: "ok";
  checkedAtUtc: string;
  build: BuildInfo;
};

export type ReadinessStatusPayload = {
  status: "ready" | "not_ready";
  checkedAtUtc: string;
  build: BuildInfo;
  checks: {
    runtimeConfig: "ok" | "failed";
    database: "ok" | "failed" | "skipped";
  };
  issues: string[];
};

export type VersionStatusPayload = {
  checkedAtUtc: string;
  build: BuildInfo;
};

export function buildHealthStatus(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    cwd?: string;
    now?: Date;
  } = {}
): HealthStatusPayload {
  return {
    status: "ok",
    checkedAtUtc: toUtcTimestamp(options.now),
    build: getBuildInfo(env, options.cwd),
  };
}

export async function buildReadinessStatus(
  options: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    now?: Date;
    databaseCheck?: () => Promise<void>;
  } = {}
): Promise<ReadinessStatusPayload> {
  const env = options.env ?? process.env;
  const validationReport = validateServerRuntimeEnv(env, {
    cwd: options.cwd,
  });

  let databaseStatus: ReadinessStatusPayload["checks"]["database"] = "skipped";
  const issues = validationReport.issues.map((issue) => issue.message);

  if (validationReport.isValidForStartup && options.databaseCheck) {
    try {
      await options.databaseCheck();
      databaseStatus = "ok";
    } catch {
      databaseStatus = "failed";
      issues.push("Database connection check failed.");
    }
  }

  return {
    status:
      validationReport.isValidForStartup && databaseStatus !== "failed"
        ? "ready"
        : "not_ready",
    checkedAtUtc: toUtcTimestamp(options.now),
    build: getBuildInfo(env, options.cwd),
    checks: {
      runtimeConfig: validationReport.isValidForStartup ? "ok" : "failed",
      database: databaseStatus,
    },
    issues,
  };
}

export function buildVersionStatus(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    cwd?: string;
    now?: Date;
  } = {}
): VersionStatusPayload {
  return {
    checkedAtUtc: toUtcTimestamp(options.now),
    build: getBuildInfo(env, options.cwd),
  };
}

export function httpStatusFromReadiness(payload: ReadinessStatusPayload): number {
  return payload.status === "ready" ? 200 : 503;
}

export function getBuildInfo(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): BuildInfo {
  return {
    service: "pcad-license-server",
    appVersion: readPackageVersion(cwd),
    buildSha: trimEnv(env.APP_BUILD_SHA),
    buildTimeUtc: trimEnv(env.APP_BUILD_TIME_UTC),
    nodeEnv: env.NODE_ENV?.trim() || "development",
  };
}

function readPackageVersion(cwd: string): string {
  const packageJsonPath = path.join(cwd, "package.json");
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
    };
    return packageJson.version?.trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function toUtcTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function trimEnv(value?: string): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}
