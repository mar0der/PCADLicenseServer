import { type PrismaClient } from "@prisma/client";

import { buildSnapshotPayload, createSignedSnapshotEnvelope, SNAPSHOT_GRACE_INTERVAL_DAYS, SNAPSHOT_REFRESH_INTERVAL_HOURS, type SnapshotEnvelope } from "./snapshotContract";
import { resolveUserPluginAccess, AccessControlServiceError } from "./service";

export async function issueAccessSnapshot(
  prisma: PrismaClient,
  input: {
    pluginSlug: string;
    username: string;
    machineName: string;
    machineFingerprint: string;
    revitVersion: string;
    pluginVersion?: string;
    now?: Date;
  },
  privateKeyPem: string
): Promise<{
  envelope: SnapshotEnvelope;
  commandAccess: Awaited<ReturnType<typeof resolveUserPluginAccess>>["resolved"]["commandAccess"];
}> {
  const now = input.now ?? new Date();
  const access = await resolveUserPluginAccess(prisma, {
    username: input.username,
    pluginSlug: input.pluginSlug,
    now,
  });

  if (!access.user.isActive) {
    throw new AccessControlServiceError("USER_INACTIVE", 403, `Inactive user: ${input.username}`);
  }

  const refreshAfterUtc = new Date(now.getTime() + SNAPSHOT_REFRESH_INTERVAL_HOURS * 60 * 60 * 1000);
  const graceUntilUtc = new Date(now.getTime() + SNAPSHOT_GRACE_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  const payload = buildSnapshotPayload({
    pluginSlug: input.pluginSlug,
    username: access.user.username,
    machineFingerprint: input.machineFingerprint,
    machineName: input.machineName,
    revitVersion: input.revitVersion,
    baseRole: access.user.baseRole,
    allowedCommandKeys: access.resolved.allowedCommandKeys,
    issuedAtUtc: now,
    refreshAfterUtc,
    graceUntilUtc,
  });

  const envelope = createSignedSnapshotEnvelope(payload, privateKeyPem);

  await prisma.pluginSessionSnapshot.create({
    data: {
      snapshotId: payload.snapshotId,
      userId: access.user.id,
      pluginSlug: input.pluginSlug,
      pluginVersion: input.pluginVersion?.trim() || null,
      machineFingerprint: input.machineFingerprint,
      machineName: input.machineName,
      revitVersion: input.revitVersion,
      policyVersion: payload.policyVersion,
      issuedAtUtc: now,
      refreshAfterUtc,
      graceUntilUtc,
      allowedCommandKeys: JSON.stringify(payload.allowedCommandKeys),
    },
  });

  await prisma.user.update({
    where: { id: access.user.id },
    data: {
      lastLogin: now,
      lastLoginAt: now,
      machineName: input.machineName,
      lastMachineName: input.machineName,
      lastMachineFingerprint: input.machineFingerprint,
      lastRevitVersion: input.revitVersion,
    },
  });

  return {
    envelope,
    commandAccess: access.resolved.commandAccess,
  };
}
