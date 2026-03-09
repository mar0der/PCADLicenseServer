import { type PrismaClient } from "@prisma/client";

import {
  AccessControlServiceError,
  resolveUserPluginAccess,
} from "../access-control/service";
import {
  SNAPSHOT_GRACE_INTERVAL_DAYS,
  SNAPSHOT_REFRESH_INTERVAL_HOURS,
} from "../access-control/snapshotContract";

import {
  buildSignedPluginConfigSnapshotEnvelope,
  type PluginConfigSnapshotEnvelope,
} from "./configSnapshot";

export async function issuePluginConfigSnapshot(
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
  envelope: PluginConfigSnapshotEnvelope;
  commandAccess: Awaited<
    ReturnType<typeof resolveUserPluginAccess>
  >["resolved"]["commandAccess"];
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

  const refreshAfterUtc = new Date(
    now.getTime() + SNAPSHOT_REFRESH_INTERVAL_HOURS * 60 * 60 * 1000
  );
  const graceUntilUtc = new Date(
    now.getTime() + SNAPSHOT_GRACE_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  );
  const envelope = await buildSignedPluginConfigSnapshotEnvelope(
    prisma,
    {
      pluginSlug: input.pluginSlug,
      username: access.user.username,
      machineFingerprint: input.machineFingerprint,
      machineName: input.machineName,
      revitVersion: input.revitVersion,
      pluginVersion: input.pluginVersion,
      refreshAfterUtc,
      graceUntilUtc,
      now,
    },
    privateKeyPem
  );

  await prisma.pluginSessionSnapshot.create({
    data: {
      snapshotId: envelope.payload.snapshotId,
      userId: access.user.id,
      pluginSlug: input.pluginSlug,
      pluginVersion: input.pluginVersion?.trim() || null,
      machineFingerprint: input.machineFingerprint,
      machineName: input.machineName,
      revitVersion: input.revitVersion,
      policyVersion: envelope.payload.policyVersion,
      issuedAtUtc: now,
      refreshAfterUtc,
      graceUntilUtc,
      allowedCommandKeys: JSON.stringify(envelope.payload.access.allowedCommandKeys),
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
