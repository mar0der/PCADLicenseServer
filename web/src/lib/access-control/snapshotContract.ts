import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import type { BaseRoleValue } from "./resolveEffectiveAllowedCommandKeys";

export const ACCESS_SNAPSHOT_FORMAT = "pcad-access-snapshot/v1";
export const ACCESS_POLICY_VERSION = 1;
export const SNAPSHOT_REFRESH_INTERVAL_HOURS = 24;
export const SNAPSHOT_GRACE_INTERVAL_DAYS = 7;

export type SnapshotPayload = {
  snapshotId: string;
  policyVersion: number;
  pluginSlug: string;
  username: string;
  machineFingerprint: string;
  machineName: string;
  revitVersion: string;
  baseRole: BaseRoleValue;
  allowedCommandKeys: string[];
  issuedAtUtc: string;
  refreshAfterUtc: string;
  graceUntilUtc: string;
};

export type SnapshotEnvelope = {
  format: typeof ACCESS_SNAPSHOT_FORMAT;
  payload: SnapshotPayload;
  signature: string;
};

export function formatSnapshotUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function sortDistinctCommandKeys(commandKeys: string[]): string[] {
  return Array.from(new Set(commandKeys)).sort((left, right) => {
    if (left < right) {
      return -1;
    }

    if (left > right) {
      return 1;
    }

    return 0;
  });
}

export function buildSnapshotPayload(input: {
  snapshotId?: string;
  policyVersion?: number;
  pluginSlug: string;
  username: string;
  machineFingerprint: string;
  machineName: string;
  revitVersion: string;
  baseRole: BaseRoleValue;
  allowedCommandKeys: string[];
  issuedAtUtc: Date;
  refreshAfterUtc: Date;
  graceUntilUtc: Date;
}): SnapshotPayload {
  return {
    snapshotId: input.snapshotId ?? randomUUID(),
    policyVersion: input.policyVersion ?? ACCESS_POLICY_VERSION,
    pluginSlug: input.pluginSlug,
    username: input.username,
    machineFingerprint: input.machineFingerprint,
    machineName: input.machineName,
    revitVersion: input.revitVersion,
    baseRole: input.baseRole,
    allowedCommandKeys: sortDistinctCommandKeys(input.allowedCommandKeys),
    issuedAtUtc: formatSnapshotUtc(input.issuedAtUtc),
    refreshAfterUtc: formatSnapshotUtc(input.refreshAfterUtc),
    graceUntilUtc: formatSnapshotUtc(input.graceUntilUtc),
  };
}

export function serializeCanonicalSnapshotPayload(payload: SnapshotPayload): string {
  return JSON.stringify({
    snapshotId: payload.snapshotId,
    policyVersion: payload.policyVersion,
    pluginSlug: payload.pluginSlug,
    username: payload.username,
    machineFingerprint: payload.machineFingerprint,
    machineName: payload.machineName,
    revitVersion: payload.revitVersion,
    baseRole: payload.baseRole,
    allowedCommandKeys: sortDistinctCommandKeys(payload.allowedCommandKeys),
    issuedAtUtc: payload.issuedAtUtc,
    refreshAfterUtc: payload.refreshAfterUtc,
    graceUntilUtc: payload.graceUntilUtc,
  });
}

export function signSnapshotPayload(payload: SnapshotPayload, privateKeyPem: string): string {
  const canonicalPayload = serializeCanonicalSnapshotPayload(payload);
  const signature = crypto.sign("RSA-SHA256", Buffer.from(canonicalPayload, "utf8"), privateKeyPem);
  return signature.toString("base64url");
}

export function verifySnapshotPayloadSignature(payload: SnapshotPayload, signature: string, publicKeyPem: string): boolean {
  const canonicalPayload = serializeCanonicalSnapshotPayload(payload);
  return crypto.verify(
    "RSA-SHA256",
    Buffer.from(canonicalPayload, "utf8"),
    publicKeyPem,
    Buffer.from(signature, "base64url")
  );
}

export function createSignedSnapshotEnvelope(payload: SnapshotPayload, privateKeyPem: string): SnapshotEnvelope {
  return {
    format: ACCESS_SNAPSHOT_FORMAT,
    payload,
    signature: signSnapshotPayload(payload, privateKeyPem),
  };
}
