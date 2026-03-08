import {
  BaseRole,
  PrismaClient,
  UserCommandOverrideEffect,
  type Command,
  type User,
} from "@prisma/client";

import {
  resolveEffectiveCommandAccess,
  type BaseRoleValue,
  type OverrideEffectValue,
  type PolicyCommand,
  type PolicyOverride,
} from "./resolveEffectiveAllowedCommandKeys";

export class AccessControlServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function resolveUserPluginAccess(
  prisma: PrismaClient,
  input: {
    username: string;
    pluginSlug: string;
    now?: Date;
  }
): Promise<{
  user: User;
  commands: Command[];
  overrides: PolicyOverride[];
  resolved: ReturnType<typeof resolveEffectiveCommandAccess>;
}> {
  const user = await prisma.user.findUnique({
    where: { username: input.username },
  });

  if (!user) {
    throw new AccessControlServiceError("USER_NOT_FOUND", 404, `Unknown user: ${input.username}`);
  }

  const commands = await prisma.command.findMany({
    where: { pluginSlug: input.pluginSlug },
    orderBy: { commandKey: "asc" },
  });

  const overrides = await prisma.userCommandOverride.findMany({
    where: {
      userId: user.id,
      command: {
        pluginSlug: input.pluginSlug,
      },
    },
    include: {
      command: {
        select: {
          commandKey: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const resolved = resolveEffectiveCommandAccess({
    user: {
      isActive: user.isActive,
      baseRole: user.baseRole as BaseRoleValue,
    },
    commands: commands.map<PolicyCommand>((command) => ({
      commandKey: command.commandKey,
      stage: command.stage,
    })),
    overrides: overrides.map<PolicyOverride>((override) => ({
      commandKey: override.command.commandKey,
      effect: override.effect as OverrideEffectValue,
      expiresAt: override.expiresAt,
    })),
    now: input.now,
  });

  return {
    user,
    commands,
    overrides: overrides.map((override) => ({
      commandKey: override.command.commandKey,
      effect: override.effect as OverrideEffectValue,
      expiresAt: override.expiresAt,
    })),
    resolved,
  };
}

export async function previewEffectiveAccess(
  prisma: PrismaClient,
  input: {
    username: string;
    pluginSlug: string;
    now?: Date;
  }
): Promise<{
  pluginSlug: string;
  username: string;
  baseRole: BaseRole;
  isActive: boolean;
  allowedCommandKeys: string[];
  commandAccess: ReturnType<typeof resolveEffectiveCommandAccess>["commandAccess"];
}> {
  const access = await resolveUserPluginAccess(prisma, input);

  return {
    pluginSlug: input.pluginSlug,
    username: access.user.username,
    baseRole: access.user.baseRole,
    isActive: access.user.isActive,
    allowedCommandKeys: access.resolved.allowedCommandKeys,
    commandAccess: access.resolved.commandAccess,
  };
}

export async function listUserCommandOverrides(
  prisma: PrismaClient,
  input: {
    username: string;
    pluginSlug: string;
  }
): Promise<{
  pluginSlug: string;
  username: string;
  overrides: Array<{
    id: string;
    commandKey: string;
    effect: UserCommandOverrideEffect;
    expiresAt: Date | null;
    reason: string | null;
    createdAt: Date;
  }>;
}> {
  const user = await prisma.user.findUnique({
    where: { username: input.username },
  });

  if (!user) {
    throw new AccessControlServiceError("USER_NOT_FOUND", 404, `Unknown user: ${input.username}`);
  }

  const overrides = await prisma.userCommandOverride.findMany({
    where: {
      userId: user.id,
      command: {
        pluginSlug: input.pluginSlug,
      },
    },
    include: {
      command: {
        select: {
          commandKey: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    pluginSlug: input.pluginSlug,
    username: user.username,
    overrides: overrides
      .sort((left, right) => {
        if (left.command.commandKey < right.command.commandKey) {
          return -1;
        }

        if (left.command.commandKey > right.command.commandKey) {
          return 1;
        }

        return left.createdAt.getTime() - right.createdAt.getTime();
      })
      .map((override) => ({
      id: override.id,
      commandKey: override.command.commandKey,
      effect: override.effect,
      expiresAt: override.expiresAt,
      reason: override.reason,
      createdAt: override.createdAt,
    })),
  };
}

export async function createUserCommandOverride(
  prisma: PrismaClient,
  input: {
    username: string;
    pluginSlug: string;
    commandKey: string;
    effect: UserCommandOverrideEffect;
    expiresAt?: string | null;
    reason?: string | null;
  }
): Promise<{
  id: string;
  username: string;
  pluginSlug: string;
  commandKey: string;
  effect: UserCommandOverrideEffect;
  expiresAt: Date | null;
  reason: string | null;
  createdAt: Date;
}> {
  const user = await prisma.user.findUnique({
    where: { username: input.username },
  });

  if (!user) {
    throw new AccessControlServiceError("USER_NOT_FOUND", 404, `Unknown user: ${input.username}`);
  }

  const command = await prisma.command.findUnique({
    where: {
      pluginSlug_commandKey: {
        pluginSlug: input.pluginSlug,
        commandKey: input.commandKey,
      },
    },
  });

  if (!command) {
    throw new AccessControlServiceError(
      "COMMAND_NOT_FOUND",
      404,
      `Unknown command for plugin ${input.pluginSlug}: ${input.commandKey}`
    );
  }

  const expiresAt = parseOptionalDate(input.expiresAt);
  const override = await prisma.userCommandOverride.create({
    data: {
      userId: user.id,
      commandId: command.id,
      effect: input.effect,
      expiresAt,
      reason: input.reason?.trim() || null,
    },
  });

  return {
    id: override.id,
    username: user.username,
    pluginSlug: input.pluginSlug,
    commandKey: command.commandKey,
    effect: override.effect,
    expiresAt: override.expiresAt,
    reason: override.reason,
    createdAt: override.createdAt,
  };
}

export async function deleteUserCommandOverride(
  prisma: PrismaClient,
  input: {
    id: string;
  }
): Promise<void> {
  await prisma.userCommandOverride.delete({
    where: { id: input.id },
  });
}

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new AccessControlServiceError("INVALID_EXPIRES_AT", 400, `Invalid expiresAt: ${value}`);
  }

  return parsedDate;
}
