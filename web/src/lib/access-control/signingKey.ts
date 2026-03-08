import fs from "node:fs";
import path from "node:path";

export const ACCESS_SNAPSHOT_PRIVATE_KEY_PATH_ENV = "ACCESS_SNAPSHOT_PRIVATE_KEY_PATH";
export const ACCESS_SNAPSHOT_PRIVATE_KEY_PEM_ENV = "ACCESS_SNAPSHOT_PRIVATE_KEY_PEM";

export function loadAccessSnapshotPrivateKeyPem(): string {
  const privateKeyPem = process.env[ACCESS_SNAPSHOT_PRIVATE_KEY_PEM_ENV]?.trim();
  if (privateKeyPem) {
    return privateKeyPem;
  }

  const privateKeyPath = process.env[ACCESS_SNAPSHOT_PRIVATE_KEY_PATH_ENV]?.trim();
  if (!privateKeyPath) {
    throw new Error(
      `Missing ${ACCESS_SNAPSHOT_PRIVATE_KEY_PEM_ENV} or ${ACCESS_SNAPSHOT_PRIVATE_KEY_PATH_ENV}`
    );
  }

  const resolvedPath = path.isAbsolute(privateKeyPath)
    ? privateKeyPath
    : path.resolve(process.cwd(), privateKeyPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Snapshot private key file not found: ${resolvedPath}`);
  }

  return fs.readFileSync(resolvedPath, "utf8");
}
