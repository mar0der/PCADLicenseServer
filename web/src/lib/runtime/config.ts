import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export const PRODUCTION_REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "PLUGIN_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "ACCESS_SNAPSHOT_PRIVATE_KEY_PATH or ACCESS_SNAPSHOT_PRIVATE_KEY_PEM",
] as const;

export type RuntimeMode = "development" | "test" | "production";

export type RuntimeValidationIssue = {
  code: string;
  message: string;
};

export type RuntimeValidationReport = {
  mode: RuntimeMode;
  isValidForStartup: boolean;
  issues: RuntimeValidationIssue[];
  summary: {
    databaseConfigured: boolean;
    nextAuthConfigured: boolean;
    pluginAuthConfigured: boolean;
    adminAuthConfigured: boolean;
    accessSnapshotSigningConfigured: boolean;
  };
};

export function detectRuntimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  if (env.NODE_ENV === "production") {
    return "production";
  }

  if (env.NODE_ENV === "test") {
    return "test";
  }

  return "development";
}

export function validateServerRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    cwd?: string;
    requireSigningKeyFile?: boolean;
  } = {}
): RuntimeValidationReport {
  const mode = detectRuntimeMode(env);
  const cwd = options.cwd ?? process.cwd();
  const requireSigningKeyFile = options.requireSigningKeyFile ?? true;
  const issues: RuntimeValidationIssue[] = [];

  const databaseUrl = trimEnv(env.DATABASE_URL);
  const nextAuthUrl = trimEnv(env.NEXTAUTH_URL);
  const nextAuthSecret = trimEnv(env.NEXTAUTH_SECRET);
  const pluginSecret = trimEnv(env.PLUGIN_SECRET);
  const adminUsername = trimEnv(env.ADMIN_USERNAME);
  const adminPassword = trimEnv(env.ADMIN_PASSWORD);
  const accessSnapshotPrivateKeyPem = trimEnv(env.ACCESS_SNAPSHOT_PRIVATE_KEY_PEM);
  const accessSnapshotPrivateKeyPath = trimEnv(env.ACCESS_SNAPSHOT_PRIVATE_KEY_PATH);

  if (!databaseUrl) {
    issues.push({
      code: "DATABASE_URL_MISSING",
      message: "DATABASE_URL is required.",
    });
  }

  if (mode === "production") {
    requireNonEmpty(issues, "NEXTAUTH_URL_MISSING", "NEXTAUTH_URL is required.", nextAuthUrl);
    requireNonEmpty(
      issues,
      "NEXTAUTH_SECRET_MISSING",
      "NEXTAUTH_SECRET is required.",
      nextAuthSecret
    );
    requireNonEmpty(
      issues,
      "PLUGIN_SECRET_MISSING",
      "PLUGIN_SECRET is required.",
      pluginSecret
    );
    requireNonEmpty(
      issues,
      "ADMIN_USERNAME_MISSING",
      "ADMIN_USERNAME is required.",
      adminUsername
    );
    requireNonEmpty(
      issues,
      "ADMIN_PASSWORD_MISSING",
      "ADMIN_PASSWORD is required.",
      adminPassword
    );

    if (!accessSnapshotPrivateKeyPem && !accessSnapshotPrivateKeyPath) {
      issues.push({
        code: "ACCESS_SNAPSHOT_PRIVATE_KEY_MISSING",
        message:
          "Either ACCESS_SNAPSHOT_PRIVATE_KEY_PEM or ACCESS_SNAPSHOT_PRIVATE_KEY_PATH is required.",
      });
    }
  }

  if (nextAuthUrl) {
    validateNextAuthUrl(issues, nextAuthUrl, mode);
  }

  if (mode === "production") {
    validateSecretLikeValue(
      issues,
      "NEXTAUTH_SECRET_PLACEHOLDER",
      "NEXTAUTH_SECRET still looks like a placeholder.",
      nextAuthSecret
    );
    validateSecretLikeValue(
      issues,
      "PLUGIN_SECRET_PLACEHOLDER",
      "PLUGIN_SECRET still looks like a placeholder.",
      pluginSecret
    );
    validateSecretLikeValue(
      issues,
      "ADMIN_PASSWORD_PLACEHOLDER",
      "ADMIN_PASSWORD still looks like a placeholder.",
      adminPassword
    );
    validateSecretLikeValue(
      issues,
      "ADMIN_USERNAME_PLACEHOLDER",
      "ADMIN_USERNAME still looks like a placeholder.",
      adminUsername
    );
  }

  if (accessSnapshotPrivateKeyPem) {
    validatePrivateKeyPem(
      issues,
      "ACCESS_SNAPSHOT_PRIVATE_KEY_PEM_INVALID",
      "ACCESS_SNAPSHOT_PRIVATE_KEY_PEM must contain a usable PEM private key.",
      accessSnapshotPrivateKeyPem
    );
  } else if (accessSnapshotPrivateKeyPath && requireSigningKeyFile) {
    const resolvedPath = path.isAbsolute(accessSnapshotPrivateKeyPath)
      ? accessSnapshotPrivateKeyPath
      : path.resolve(cwd, accessSnapshotPrivateKeyPath);

    if (!fs.existsSync(resolvedPath)) {
      issues.push({
        code: "ACCESS_SNAPSHOT_PRIVATE_KEY_PATH_MISSING",
        message: "ACCESS_SNAPSHOT_PRIVATE_KEY_PATH does not point to an existing file.",
      });
    } else {
      let privateKeyPemFromFile: string;

      try {
        privateKeyPemFromFile = fs.readFileSync(resolvedPath, "utf8");
      } catch {
        issues.push({
          code: "ACCESS_SNAPSHOT_PRIVATE_KEY_PATH_UNREADABLE",
          message: "ACCESS_SNAPSHOT_PRIVATE_KEY_PATH is not readable by the runtime user.",
        });
        privateKeyPemFromFile = "";
      }

      if (privateKeyPemFromFile) {
        validatePrivateKeyPem(
          issues,
          "ACCESS_SNAPSHOT_PRIVATE_KEY_PATH_INVALID",
          "ACCESS_SNAPSHOT_PRIVATE_KEY_PATH must point to a usable PEM private key.",
          privateKeyPemFromFile
        );
      }
    }
  }

  return {
    mode,
    isValidForStartup: issues.length === 0,
    issues,
    summary: {
      databaseConfigured: Boolean(databaseUrl),
      nextAuthConfigured: Boolean(nextAuthUrl && nextAuthSecret),
      pluginAuthConfigured: Boolean(pluginSecret),
      adminAuthConfigured: Boolean(adminUsername && adminPassword),
      accessSnapshotSigningConfigured: Boolean(
        accessSnapshotPrivateKeyPem || accessSnapshotPrivateKeyPath
      ),
    },
  };
}

function validateNextAuthUrl(
  issues: RuntimeValidationIssue[],
  nextAuthUrl: string,
  mode: RuntimeMode
): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(nextAuthUrl);
  } catch {
    issues.push({
      code: "NEXTAUTH_URL_INVALID",
      message: "NEXTAUTH_URL must be an absolute URL.",
    });
    return;
  }

  if (mode === "production" && parsedUrl.protocol !== "https:") {
    issues.push({
      code: "NEXTAUTH_URL_NOT_HTTPS",
      message: "NEXTAUTH_URL must use https in production.",
    });
  }
}

function requireNonEmpty(
  issues: RuntimeValidationIssue[],
  code: string,
  message: string,
  value: string | null
): void {
  if (!value) {
    issues.push({ code, message });
  }
}

function validateSecretLikeValue(
  issues: RuntimeValidationIssue[],
  code: string,
  message: string,
  value: string | null
): void {
  if (!value) {
    return;
  }

  const placeholderPatterns = [
    /replace-with/i,
    /generate-a-random/i,
    /your-very-long/i,
    /admin123/i,
    /changeme/i,
    /example/i,
  ];

  if (placeholderPatterns.some((pattern) => pattern.test(value))) {
    issues.push({ code, message });
  }
}

function trimEnv(value?: string): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function validatePrivateKeyPem(
  issues: RuntimeValidationIssue[],
  code: string,
  message: string,
  privateKeyPem: string
): void {
  try {
    crypto.createPrivateKey(privateKeyPem);
  } catch {
    issues.push({ code, message });
  }
}
