export type BaseRoleValue = "USER" | "TESTER" | "BOSS";
export type CommandStageValue = "RELEASED" | "TESTING" | "DEVELOPMENT" | "DISABLED";
export type OverrideEffectValue = "GRANT" | "DENY";

export type PolicyUser = {
  isActive: boolean;
  baseRole: BaseRoleValue;
};

export type PolicyCommand = {
  commandKey: string;
  stage: CommandStageValue;
};

export type PolicyOverride = {
  commandKey: string;
  effect: OverrideEffectValue;
  expiresAt?: Date | string | null;
};

export type CommandAccessReason =
  | "inactive_user"
  | "disabled_command"
  | "base_role_stage"
  | "explicit_deny"
  | "explicit_grant";

export type ResolvedCommandAccess = {
  commandKey: string;
  stage: CommandStageValue;
  allowed: boolean;
  baseRoleAllowed: boolean;
  appliedEffects: OverrideEffectValue[];
  reasons: CommandAccessReason[];
};

const BASE_ROLE_STAGES: Record<BaseRoleValue, ReadonlySet<CommandStageValue>> = {
  USER: new Set(["RELEASED"]),
  TESTER: new Set(["RELEASED", "TESTING"]),
  BOSS: new Set(["RELEASED", "TESTING", "DEVELOPMENT"]),
};

function isOverrideActive(override: PolicyOverride, now: Date): boolean {
  if (!override.expiresAt) {
    return true;
  }

  const expiresAt = override.expiresAt instanceof Date ? override.expiresAt : new Date(override.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt >= now;
}

export function resolveEffectiveAllowedCommandKeys(input: {
  user: PolicyUser;
  commands: PolicyCommand[];
  overrides?: PolicyOverride[];
  now?: Date;
}): string[] {
  return resolveEffectiveCommandAccess(input).allowedCommandKeys;
}

export function resolveEffectiveCommandAccess(input: {
  user: PolicyUser;
  commands: PolicyCommand[];
  overrides?: PolicyOverride[];
  now?: Date;
}): {
  allowedCommandKeys: string[];
  commandAccess: ResolvedCommandAccess[];
} {
  const { user, commands, overrides = [], now = new Date() } = input;
  const sortedCommands = [...commands].sort((left, right) => {
    if (left.commandKey < right.commandKey) {
      return -1;
    }

    if (left.commandKey > right.commandKey) {
      return 1;
    }

    return 0;
  });

  if (!user.isActive) {
    return {
      allowedCommandKeys: [],
      commandAccess: sortedCommands.map((command) => ({
        commandKey: command.commandKey,
        stage: command.stage,
        allowed: false,
        baseRoleAllowed: false,
        appliedEffects: [],
        reasons: ["inactive_user"],
      })),
    };
  }

  const allowedStages = BASE_ROLE_STAGES[user.baseRole];
  const activeOverridesByCommandKey = new Map<string, PolicyOverride[]>();
  for (const override of overrides) {
    if (!isOverrideActive(override, now)) {
      continue;
    }

    const commandOverrides = activeOverridesByCommandKey.get(override.commandKey) ?? [];
    commandOverrides.push(override);
    activeOverridesByCommandKey.set(override.commandKey, commandOverrides);
  }

  const commandAccess = sortedCommands.map<ResolvedCommandAccess>((command) => {
    const reasons: CommandAccessReason[] = [];
    let allowed = false;
    const baseRoleAllowed = command.stage !== "DISABLED" && allowedStages.has(command.stage);
    const activeOverrides = activeOverridesByCommandKey.get(command.commandKey) ?? [];
    const appliedEffects: OverrideEffectValue[] = [];

    if (command.stage === "DISABLED") {
      reasons.push("disabled_command");
    } else if (baseRoleAllowed) {
      allowed = true;
      reasons.push("base_role_stage");
    }

    if (activeOverrides.some((override) => override.effect === "DENY")) {
      allowed = false;
      appliedEffects.push("DENY");
      reasons.push("explicit_deny");
    }

    if (command.stage !== "DISABLED" && activeOverrides.some((override) => override.effect === "GRANT")) {
      allowed = true;
      appliedEffects.push("GRANT");
      reasons.push("explicit_grant");
    }

    return {
      commandKey: command.commandKey,
      stage: command.stage,
      allowed,
      baseRoleAllowed,
      appliedEffects,
      reasons,
    };
  });

  return {
    allowedCommandKeys: commandAccess
      .filter((command) => command.allowed)
      .map((command) => command.commandKey),
    commandAccess,
  };
}
