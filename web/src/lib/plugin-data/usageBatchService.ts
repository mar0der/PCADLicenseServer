import { PrismaClient } from "@prisma/client";

import { PluginDataError } from "./error";

export type PluginUsageEventInput = {
  eventId: string;
  commandKey: string;
  username: string;
  machineFingerprint: string;
  pluginVersion: string;
  revitVersion: string;
  occurredAtUtc: string;
  snapshotId?: string | null;
};

export type PluginUsageBatchInput = {
  pluginSlug: string;
  events: PluginUsageEventInput[];
};

export async function ingestUsageBatch(
  prisma: PrismaClient,
  input: PluginUsageBatchInput
): Promise<{
  pluginSlug: string;
  acceptedEventIds: string[];
  duplicateEventIds: string[];
}> {
  validateUsageBatchInput(input);

  const dedupedPayloadEvents: PluginUsageEventInput[] = [];
  const duplicateEventIds: string[] = [];
  const seenEventIds = new Set<string>();

  for (const event of input.events) {
    const eventId = event.eventId.trim();
    if (seenEventIds.has(eventId)) {
      duplicateEventIds.push(eventId);
      continue;
    }

    seenEventIds.add(eventId);
    dedupedPayloadEvents.push(event);
  }

  const existingEvents = await prisma.rawUsageEvent.findMany({
    where: {
      eventId: {
        in: dedupedPayloadEvents.map((event) => event.eventId.trim()),
      },
    },
    select: {
      eventId: true,
    },
  });
  const existingEventIds = new Set(existingEvents.map((event) => event.eventId));

  for (const eventId of existingEventIds) {
    duplicateEventIds.push(eventId);
  }

  const snapshotIds = Array.from(
    new Set(
      dedupedPayloadEvents
        .map((event) => event.snapshotId?.trim())
        .filter((snapshotId): snapshotId is string => Boolean(snapshotId))
    )
  );
  const existingSnapshots = await prisma.pluginSessionSnapshot.findMany({
    where: {
      snapshotId: {
        in: snapshotIds,
      },
    },
    select: {
      snapshotId: true,
    },
  });
  const existingSnapshotIds = new Set(existingSnapshots.map((snapshot) => snapshot.snapshotId));

  const acceptedEvents = dedupedPayloadEvents.filter(
    (event) => !existingEventIds.has(event.eventId.trim())
  );

  if (acceptedEvents.length > 0) {
    await prisma.rawUsageEvent.createMany({
      data: acceptedEvents.map((event) => {
        const occurredAtUtc = new Date(event.occurredAtUtc);

        return {
          eventId: event.eventId.trim(),
          pluginSlug: input.pluginSlug,
          commandKey: event.commandKey.trim(),
          username: event.username.trim(),
          machineFingerprint: event.machineFingerprint.trim(),
          pluginVersion: event.pluginVersion.trim(),
          revitVersion: event.revitVersion.trim(),
          occurredAtUtc,
          occurredOnDateUtc: startOfUtcDay(occurredAtUtc),
          snapshotId:
            event.snapshotId && existingSnapshotIds.has(event.snapshotId.trim())
              ? event.snapshotId.trim()
              : null,
        };
      }),
    });
  }

  return {
    pluginSlug: input.pluginSlug,
    acceptedEventIds: acceptedEvents.map((event) => event.eventId.trim()),
    duplicateEventIds: Array.from(new Set(duplicateEventIds)),
  };
}

function validateUsageBatchInput(input: PluginUsageBatchInput): void {
  if (!input.pluginSlug.trim()) {
    throw new PluginDataError("INVALID_PLUGIN_SLUG", 400, "pluginSlug is required.");
  }

  if (!input.events.length) {
    throw new PluginDataError("EMPTY_BATCH", 400, "At least one usage event is required.");
  }

  for (const event of input.events) {
    if (
      !event.eventId.trim() ||
      !event.commandKey.trim() ||
      !event.username.trim() ||
      !event.machineFingerprint.trim() ||
      !event.pluginVersion.trim() ||
      !event.revitVersion.trim() ||
      !event.occurredAtUtc.trim()
    ) {
      throw new PluginDataError(
        "INVALID_USAGE_EVENT",
        400,
        "Every usage event must include eventId, commandKey, username, machineFingerprint, pluginVersion, revitVersion, and occurredAtUtc."
      );
    }

    const occurredAtUtc = new Date(event.occurredAtUtc);
    if (Number.isNaN(occurredAtUtc.getTime())) {
      throw new PluginDataError(
        "INVALID_OCCURRED_AT_UTC",
        400,
        `Invalid occurredAtUtc value: ${event.occurredAtUtc}`
      );
    }
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
  );
}
