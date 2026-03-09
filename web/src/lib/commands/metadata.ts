import { CommandStage, Prisma, type Command } from "@prisma/client";

import { accessLevelFromCommandStage } from "../access-control/compat";

const COMMAND_STAGES = new Set<CommandStage>([
  "RELEASED",
  "TESTING",
  "DEVELOPMENT",
  "DISABLED",
]);

type CommandMetadataState = Pick<
  Command,
  | "displayName"
  | "displayNameLocked"
  | "manifestTitle"
  | "manifestTitleLocked"
  | "description"
  | "descriptionLocked"
  | "stage"
  | "requiredAccessLevel"
  | "descriptiveName"
>;

export type PluginCommandMetadataInput = {
  displayName: string;
  manifestTitle?: string | null;
  description?: string | null;
};

export type AdminCommandMetadataUpdateInput = {
  displayName?: string;
  manifestTitle?: string | null;
  description?: string | null;
  stage?: CommandStage | string;
  commandKey?: string | null;
  uniqueName?: string | null;
  pluginSlug?: string | null;
};

export type ValidatedAdminCommandMetadataUpdate = {
  displayName?: string;
  manifestTitle?: string | null;
  description?: string | null;
  stage?: CommandStage;
};

export type CommandPresentation = {
  displayName: string;
  shortLabel: string | null;
  tooltip: string | null;
  title: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function resolveCommandPresentation(input: {
  displayName: string;
  manifestTitle?: string | null;
  description?: string | null;
}): CommandPresentation {
  const displayName = input.displayName.trim();
  const shortLabel = trimOptional(input.manifestTitle);
  const tooltip = trimOptional(input.description);

  return {
    displayName,
    shortLabel,
    tooltip,
    title: shortLabel ?? displayName,
  };
}

export function buildPluginSyncedCommandMetadataUpdate(
  existing: CommandMetadataState,
  input: PluginCommandMetadataInput
): {
  changed: boolean;
  data: Pick<Prisma.CommandUpdateInput, "displayName" | "manifestTitle" | "description" | "descriptiveName">;
} {
  const nextDisplayName = existing.displayNameLocked
    ? existing.displayName
    : input.displayName.trim();
  const nextManifestTitle = existing.manifestTitleLocked
    ? existing.manifestTitle
    : trimOptional(input.manifestTitle) ?? nextDisplayName;
  const nextDescription = existing.descriptionLocked
    ? existing.description
    : trimOptional(input.description);

  return {
    changed:
      existing.displayName !== nextDisplayName ||
      existing.manifestTitle !== nextManifestTitle ||
      existing.description !== nextDescription ||
      existing.descriptiveName !== nextDisplayName,
    data: {
      displayName: nextDisplayName,
      manifestTitle: nextManifestTitle,
      description: nextDescription,
      descriptiveName: nextDisplayName,
    },
  };
}

export function validateAdminCommandMetadataUpdate(
  input: AdminCommandMetadataUpdateInput
): ValidationResult<ValidatedAdminCommandMetadataUpdate> {
  const errors: string[] = [];
  const validated: ValidatedAdminCommandMetadataUpdate = {};

  if (hasIdentityMutationAttempt(input)) {
    errors.push("Command identity is immutable in the normal admin flow.");
  }

  const hasDisplayName = hasOwn(input, "displayName");
  const hasManifestTitle = hasOwn(input, "manifestTitle");
  const hasDescription = hasOwn(input, "description");
  const hasStage = hasOwn(input, "stage");

  if (!hasDisplayName && !hasManifestTitle && !hasDescription && !hasStage) {
    errors.push("At least one editable command metadata field is required.");
  }

  if (hasDisplayName) {
    const displayName = input.displayName?.trim() ?? "";
    if (!displayName) {
      errors.push("Display name is required.");
    } else {
      validated.displayName = displayName;
    }
  }

  if (hasManifestTitle) {
    validated.manifestTitle = trimOptional(input.manifestTitle);
  }

  if (hasDescription) {
    validated.description = trimOptional(input.description);
  }

  if (hasStage) {
    if (!COMMAND_STAGES.has(input.stage as CommandStage)) {
      errors.push("Stage must be RELEASED, TESTING, DEVELOPMENT, or DISABLED.");
    } else {
      validated.stage = input.stage as CommandStage;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: validated };
}

export function buildAdminCommandMetadataUpdate(
  existing: CommandMetadataState,
  input: ValidatedAdminCommandMetadataUpdate
): {
  changed: boolean;
  data: Prisma.CommandUpdateInput;
} {
  const data: Prisma.CommandUpdateInput = {};
  let changed = false;

  if (hasOwn(input, "displayName")) {
    const displayName = input.displayName!;
    if (
      existing.displayName !== displayName ||
      existing.descriptiveName !== displayName ||
      !existing.displayNameLocked
    ) {
      changed = true;
    }

    data.displayName = displayName;
    data.descriptiveName = displayName;
    data.displayNameLocked = true;
  }

  if (hasOwn(input, "manifestTitle")) {
    const manifestTitle = input.manifestTitle ?? null;
    if (existing.manifestTitle !== manifestTitle || !existing.manifestTitleLocked) {
      changed = true;
    }

    data.manifestTitle = manifestTitle;
    data.manifestTitleLocked = true;
  }

  if (hasOwn(input, "description")) {
    const description = input.description ?? null;
    if (existing.description !== description || !existing.descriptionLocked) {
      changed = true;
    }

    data.description = description;
    data.descriptionLocked = true;
  }

  if (hasOwn(input, "stage")) {
    const stage = input.stage!;
    const requiredAccessLevel = accessLevelFromCommandStage(stage);
    if (existing.stage !== stage || existing.requiredAccessLevel !== requiredAccessLevel) {
      changed = true;
    }

    data.stage = stage;
    data.requiredAccessLevel = requiredAccessLevel;
  }

  return {
    changed,
    data,
  };
}

function hasIdentityMutationAttempt(input: AdminCommandMetadataUpdateInput): boolean {
  return ["commandKey", "uniqueName", "pluginSlug"].some((field) => hasOwn(input, field));
}

function hasOwn(input: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function trimOptional(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}
