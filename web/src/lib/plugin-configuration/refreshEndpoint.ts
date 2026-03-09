import { type PrismaClient } from "@prisma/client";

import { verifySignature } from "../auth";
import { loadAccessSnapshotPrivateKeyPem } from "../access-control/signingKey";
import { AccessControlServiceError } from "../access-control/service";

import { issuePluginConfigSnapshot } from "./refreshService";

type RefreshRequestBody = {
  pluginSlug?: string;
  username?: string;
  machineName?: string;
  machineFingerprint?: string;
  revitVersion?: string;
  pluginVersion?: string;
};

type ValidatedRefreshRequestBody = {
  pluginSlug: string;
  username: string;
  machineName: string;
  machineFingerprint: string;
  revitVersion: string;
  pluginVersion: string;
};

type RefreshErrorBody = {
  code: string;
  message: string;
};

export async function handlePluginConfigRefreshRequest(
  prisma: PrismaClient,
  input: {
    rawBody: string;
    signature: string | null;
    now?: Date;
    loadPrivateKeyPem?: () => string;
  }
): Promise<{
  status: number;
  body:
    | RefreshErrorBody
    | Awaited<ReturnType<typeof issuePluginConfigSnapshot>>["envelope"];
}> {
  const requestBody = safeParseRefreshRequest(input.rawBody);

  if (!verifySignature(input.rawBody, input.signature)) {
    await prisma.securityEvent.create({
      data: {
        pluginSlug: requestBody?.pluginSlug ?? null,
        username: requestBody?.username ?? null,
        machineName: requestBody?.machineName ?? null,
        machineFingerprint: requestBody?.machineFingerprint ?? null,
        eventType: "invalid_signature",
        reason: "Invalid plugin signature during /api/plugin/config/refresh",
      },
    });

    return {
      status: 401,
      body: {
        code: "INVALID_SIGNATURE",
        message: "Invalid signature",
      },
    };
  }

  if (!requestBody) {
    await prisma.securityEvent.create({
      data: {
        eventType: "invalid_request",
        reason: "Malformed JSON during /api/plugin/config/refresh",
      },
    });

    return {
      status: 400,
      body: {
        code: "INVALID_REQUEST",
        message: "Malformed request body",
      },
    };
  }

  const validatedBody = validateRefreshRequestBody(requestBody);
  if (!validatedBody) {
    await prisma.securityEvent.create({
      data: {
        pluginSlug: requestBody.pluginSlug ?? null,
        username: requestBody.username ?? null,
        machineName: requestBody.machineName ?? null,
        machineFingerprint: requestBody.machineFingerprint ?? null,
        eventType: "invalid_request",
        reason: "Missing one or more required fields for /api/plugin/config/refresh",
      },
    });

    return {
      status: 400,
      body: {
        code: "INVALID_REQUEST",
        message: "Missing one or more required fields",
      },
    };
  }

  let privateKeyPem: string;
  try {
    privateKeyPem = (input.loadPrivateKeyPem ?? loadAccessSnapshotPrivateKeyPem)();
  } catch (error) {
    await prisma.securityEvent.create({
      data: {
        pluginSlug: requestBody.pluginSlug,
        username: requestBody.username,
        machineName: requestBody.machineName,
        machineFingerprint: requestBody.machineFingerprint,
        eventType: "config_snapshot_signing_key_unavailable",
        reason: error instanceof Error ? error.message : "Config snapshot signing key unavailable",
      },
    });

    return {
      status: 500,
      body: {
        code: "SIGNING_KEY_UNAVAILABLE",
        message: "Snapshot signing key unavailable",
      },
    };
  }

  try {
    const snapshot = await issuePluginConfigSnapshot(
      prisma,
      {
        pluginSlug: validatedBody.pluginSlug,
        username: validatedBody.username,
        machineName: validatedBody.machineName,
        machineFingerprint: validatedBody.machineFingerprint,
        revitVersion: validatedBody.revitVersion,
        pluginVersion: validatedBody.pluginVersion,
        now: input.now,
      },
      privateKeyPem
    );

    return {
      status: 200,
      body: snapshot.envelope,
    };
  } catch (error) {
    if (error instanceof AccessControlServiceError) {
      const user = requestBody.username
        ? await prisma.user.findUnique({ where: { username: requestBody.username } })
        : null;

      await prisma.securityEvent.create({
        data: {
          userId: user?.id ?? null,
          pluginSlug: requestBody.pluginSlug,
          username: requestBody.username,
          machineName: requestBody.machineName,
          machineFingerprint: requestBody.machineFingerprint,
          eventType: error.code === "USER_INACTIVE" ? "disabled_user_attempt" : "unknown_user_attempt",
          reason: error.message,
        },
      });

      return {
        status: error.status === 404 ? 403 : error.status,
        body: {
          code: error.code,
          message: "Access denied",
        },
      };
    }

    await prisma.securityEvent.create({
      data: {
        pluginSlug: requestBody.pluginSlug,
        username: requestBody.username,
        machineName: requestBody.machineName,
        machineFingerprint: requestBody.machineFingerprint,
        eventType: "config_snapshot_issue_failed",
        reason: error instanceof Error ? error.message : "Failed to issue plugin config snapshot",
      },
    });

    return {
      status: 500,
      body: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    };
  }
}

function safeParseRefreshRequest(rawBody: string): RefreshRequestBody | null {
  try {
    return JSON.parse(rawBody) as RefreshRequestBody;
  } catch {
    return null;
  }
}

function validateRefreshRequestBody(body: RefreshRequestBody): ValidatedRefreshRequestBody | null {
  const requiredFields: Array<keyof RefreshRequestBody> = [
    "pluginSlug",
    "username",
    "machineName",
    "machineFingerprint",
    "revitVersion",
    "pluginVersion",
  ];

  for (const field of requiredFields) {
    if (!body[field] || !body[field]?.trim()) {
      return null;
    }
  }

  return {
    pluginSlug: body.pluginSlug!,
    username: body.username!,
    machineName: body.machineName!,
    machineFingerprint: body.machineFingerprint!,
    revitVersion: body.revitVersion!,
    pluginVersion: body.pluginVersion!,
  };
}
