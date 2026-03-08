import type { BaseRole, UserCommandOverrideEffect } from "@prisma/client";

import type {
  CommandAccessReason,
  ResolvedCommandAccess,
} from "../access-control/resolveEffectiveAllowedCommandKeys";

export type OverrideFormInput = {
  commandKey: string;
  effect: string;
  expiresAtLocal: string;
  reason: string;
};

export type ValidatedOverrideForm = {
  commandKey: string;
  effect: UserCommandOverrideEffect;
  expiresAt: string | null;
  reason: string | null;
};

export type OverrideValidationResult =
  | { ok: true; value: ValidatedOverrideForm }
  | { ok: false; errors: string[] };

export type PreviewDisplayRow = {
  commandKey: string;
  stage: ResolvedCommandAccess["stage"];
  statusLabel: "Allowed" | "Blocked";
  reasonBadges: string[];
  reasonSummary: string;
};

const OVERRIDE_EFFECTS = new Set<UserCommandOverrideEffect>(["GRANT", "DENY"]);

export function validateOverrideForm(
  input: OverrideFormInput,
  availableCommandKeys: string[]
): OverrideValidationResult {
  const errors: string[] = [];
  const commandKey = input.commandKey.trim();
  const reason = input.reason.trim();
  const expiresAtLocal = input.expiresAtLocal.trim();
  const availableCommandKeySet = new Set(availableCommandKeys);

  if (!commandKey) {
    errors.push("Command key is required.");
  } else if (!availableCommandKeySet.has(commandKey)) {
    errors.push("Select a Dokaflex command from the current catalog.");
  }

  if (!OVERRIDE_EFFECTS.has(input.effect as UserCommandOverrideEffect)) {
    errors.push("Override effect must be GRANT or DENY.");
  }

  let expiresAt: string | null = null;
  if (expiresAtLocal) {
    const parsedExpiry = new Date(expiresAtLocal);
    if (Number.isNaN(parsedExpiry.getTime())) {
      errors.push("Expiry must be a valid date and time.");
    } else {
      expiresAt = parsedExpiry.toISOString();
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      commandKey,
      effect: input.effect as UserCommandOverrideEffect,
      expiresAt,
      reason: reason || null,
    },
  };
}

export function validateOverrideDeleteId(overrideId: string): string | null {
  return overrideId.trim() ? null : "Override id is required.";
}

export function buildPreviewDisplayRows(input: {
  baseRole: BaseRole;
  commandAccess: ResolvedCommandAccess[];
}): PreviewDisplayRow[] {
  return input.commandAccess.map((command) => {
    const reasonBadges = command.reasons.map((reason) =>
      mapReasonToBadge(reason, input.baseRole)
    );

    return {
      commandKey: command.commandKey,
      stage: command.stage,
      statusLabel: command.allowed ? "Allowed" : "Blocked",
      reasonBadges,
      reasonSummary: reasonBadges.join(", ") || "No matching policy basis",
    };
  });
}

function mapReasonToBadge(reason: CommandAccessReason, baseRole: BaseRole): string {
  switch (reason) {
    case "base_role_stage":
      return `${baseRole} base role`;
    case "explicit_grant":
      return "Explicit grant";
    case "explicit_deny":
      return "Explicit deny";
    case "disabled_command":
      return "Disabled command";
    case "inactive_user":
      return "Inactive user";
    default:
      return "Unknown reason";
  }
}
