import crypto, { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import {
  formatSnapshotUtc,
  SNAPSHOT_GRACE_INTERVAL_DAYS,
  SNAPSHOT_REFRESH_INTERVAL_HOURS,
} from "../access-control/snapshotContract";
import { resolveUserPluginAccess } from "../access-control/service";
import { getRibbonLayoutDocument } from "../ribbon-layout/service";
import { getPluginConfigurationState } from "./state";

export const PLUGIN_CONFIG_SNAPSHOT_FORMAT = "pcad-plugin-config/v1";

export type PluginConfigSnapshotPayload = {
  snapshotId: string;
  pluginSlug: string;
  username: string;
  machineFingerprint: string;
  machineName: string;
  revitVersion: string;
  pluginVersion: string | null;
  issuedAtUtc: string;
  refreshAfterUtc: string;
  graceUntilUtc: string;
  policyVersion: number;
  capabilityCatalogVersion: number;
  ribbonLayoutVersion: number;
  configVersion: number;
  access: {
    baseRole: string;
    allowedCommandKeys: string[];
  };
  commands: Array<{
    commandKey: string;
    displayName: string;
    manifestTitle: string | null;
    iconCommandKey: string | null;
    stage: string;
    category: string | null;
    description: string | null;
  }>;
  icons: Array<{
    iconKey: string;
    contentType: string | null;
    dataUri: string;
  }>;
  ribbonLayout: {
    tabs: Awaited<ReturnType<typeof getRibbonLayoutDocument>>["tabs"];
  };
};

export type PluginConfigSnapshotEnvelope = {
  format: typeof PLUGIN_CONFIG_SNAPSHOT_FORMAT;
  payload: PluginConfigSnapshotPayload;
  signature: string;
};

export async function buildSignedPluginConfigSnapshotEnvelope(
  prisma: PrismaClient,
  input: {
    pluginSlug: string;
    username: string;
    machineFingerprint: string;
    machineName: string;
    revitVersion: string;
    pluginVersion?: string | null;
    refreshAfterUtc?: Date;
    graceUntilUtc?: Date;
    now?: Date;
  },
  privateKeyPem: string
): Promise<PluginConfigSnapshotEnvelope> {
  const now = input.now ?? new Date();
  const refreshAfterUtc =
    input.refreshAfterUtc ??
    new Date(now.getTime() + SNAPSHOT_REFRESH_INTERVAL_HOURS * 60 * 60 * 1000);
  const graceUntilUtc =
    input.graceUntilUtc ??
    new Date(now.getTime() + SNAPSHOT_GRACE_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  const [access, layout, versions, commands, icons] = await Promise.all([
    resolveUserPluginAccess(prisma, {
      username: input.username,
      pluginSlug: input.pluginSlug,
      now,
    }),
    getRibbonLayoutDocument(prisma, { pluginSlug: input.pluginSlug }),
    getPluginConfigurationState(prisma, input.pluginSlug),
    prisma.command.findMany({
      where: { pluginSlug: input.pluginSlug },
      orderBy: { commandKey: "asc" },
    }),
    prisma.iconAsset.findMany({
      where: { pluginSlug: input.pluginSlug },
      orderBy: { iconKey: "asc" },
    }),
  ]);

  const payload: PluginConfigSnapshotPayload = {
    snapshotId: randomUUID(),
    pluginSlug: input.pluginSlug,
    username: input.username,
    machineFingerprint: input.machineFingerprint,
    machineName: input.machineName,
    revitVersion: input.revitVersion,
    pluginVersion: input.pluginVersion?.trim() || null,
    issuedAtUtc: formatSnapshotUtc(now),
    refreshAfterUtc: formatSnapshotUtc(refreshAfterUtc),
    graceUntilUtc: formatSnapshotUtc(graceUntilUtc),
    policyVersion: 1,
    capabilityCatalogVersion: versions.capabilityCatalogVersion,
    ribbonLayoutVersion: versions.ribbonLayoutVersion,
    configVersion: versions.configVersion,
    access: {
      baseRole: access.user.baseRole,
      allowedCommandKeys: [...access.resolved.allowedCommandKeys],
    },
    commands: commands.map((command) => ({
      commandKey: command.commandKey,
      displayName: command.displayName,
      manifestTitle: command.manifestTitle,
      iconCommandKey: command.iconCommandKey,
      stage: command.stage,
      category: command.category,
      description: command.description,
    })),
    icons: icons.map((icon) => ({
      iconKey: icon.iconKey,
      contentType: icon.contentType,
      dataUri: icon.dataUri,
    })),
    ribbonLayout: {
      tabs: layout.tabs,
    },
  };

  return {
    format: PLUGIN_CONFIG_SNAPSHOT_FORMAT,
    payload,
    signature: signPluginConfigSnapshotPayload(payload, privateKeyPem),
  };
}

export function serializeCanonicalPluginConfigSnapshotPayload(
  payload: PluginConfigSnapshotPayload
): string {
  return JSON.stringify({
    snapshotId: payload.snapshotId,
    pluginSlug: payload.pluginSlug,
    username: payload.username,
    machineFingerprint: payload.machineFingerprint,
    machineName: payload.machineName,
    revitVersion: payload.revitVersion,
    pluginVersion: payload.pluginVersion,
    issuedAtUtc: payload.issuedAtUtc,
    refreshAfterUtc: payload.refreshAfterUtc,
    graceUntilUtc: payload.graceUntilUtc,
    policyVersion: payload.policyVersion,
    capabilityCatalogVersion: payload.capabilityCatalogVersion,
    ribbonLayoutVersion: payload.ribbonLayoutVersion,
    configVersion: payload.configVersion,
    access: {
      baseRole: payload.access.baseRole,
      allowedCommandKeys: payload.access.allowedCommandKeys,
    },
    commands: payload.commands.map((command) => ({
      commandKey: command.commandKey,
      displayName: command.displayName,
      manifestTitle: command.manifestTitle,
      iconCommandKey: command.iconCommandKey,
      stage: command.stage,
      category: command.category,
      description: command.description,
    })),
    icons: payload.icons.map((icon) => ({
      iconKey: icon.iconKey,
      contentType: icon.contentType,
      dataUri: icon.dataUri,
    })),
    ribbonLayout: {
      tabs: payload.ribbonLayout.tabs.map((tab) => ({
        tabKey: tab.tabKey,
        title: tab.title,
        order: tab.order,
        panels: tab.panels.map((panel) => ({
          panelKey: panel.panelKey,
          title: panel.title,
          order: panel.order,
          items: serializeLayoutItems(panel.items),
        })),
      })),
    },
  });
}

export function signPluginConfigSnapshotPayload(
  payload: PluginConfigSnapshotPayload,
  privateKeyPem: string
): string {
  const canonicalPayload = serializeCanonicalPluginConfigSnapshotPayload(payload);
  const signature = crypto.sign("RSA-SHA256", Buffer.from(canonicalPayload, "utf8"), privateKeyPem);
  return signature.toString("base64url");
}

export function verifyPluginConfigSnapshotSignature(
  payload: PluginConfigSnapshotPayload,
  signature: string,
  publicKeyPem: string
): boolean {
  const canonicalPayload = serializeCanonicalPluginConfigSnapshotPayload(payload);
  return crypto.verify(
    "RSA-SHA256",
    Buffer.from(canonicalPayload, "utf8"),
    publicKeyPem,
    Buffer.from(signature, "base64url")
  );
}

function serializeLayoutItems(
  items: PluginConfigSnapshotPayload["ribbonLayout"]["tabs"][number]["panels"][number]["items"]
): Array<{
  itemKey: string;
  order: number;
  kind: PluginConfigSnapshotPayload["ribbonLayout"]["tabs"][number]["panels"][number]["items"][number]["kind"];
  size: string | null;
  commandKey: string | null;
  iconCommandKey: string | null;
  title: string | null;
  children: ReturnType<typeof serializeLayoutItems>;
}> {
  return items.map((item) => ({
    itemKey: item.itemKey,
    order: item.order,
    kind: item.kind,
    size: item.size ?? null,
    commandKey: item.commandKey ?? null,
    iconCommandKey: item.iconCommandKey ?? null,
    title: item.title ?? null,
    children: serializeLayoutItems(item.children ?? []),
  }));
}
