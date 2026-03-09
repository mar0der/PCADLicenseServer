import { type PrismaClient } from "@prisma/client";

import { verifySignature } from "../auth";

import { PluginDataError } from "./error";
import { ingestUsageBatch, type PluginUsageBatchInput } from "./usageBatchService";

type UsageBatchErrorBody = {
  code: string;
  message: string;
};

export async function handlePluginUsageBatchRequest(
  prisma: PrismaClient,
  input: {
    rawBody: string;
    signature: string | null;
  }
): Promise<{
  status: number;
  body: UsageBatchErrorBody | Awaited<ReturnType<typeof ingestUsageBatch>>;
}> {
  const requestBody = safeParseUsageBatchRequest(input.rawBody);

  if (!verifySignature(input.rawBody, input.signature)) {
    await prisma.securityEvent.create({
      data: {
        pluginSlug: requestBody?.pluginSlug ?? null,
        eventType: "invalid_signature",
        reason: "Invalid plugin signature during /api/plugin/usage/batch",
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
        reason: "Malformed JSON during /api/plugin/usage/batch",
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

  try {
    const result = await ingestUsageBatch(prisma, requestBody);
    return {
      status: 200,
      body: result,
    };
  } catch (error) {
    if (error instanceof PluginDataError) {
      await prisma.securityEvent.create({
        data: {
          pluginSlug: requestBody.pluginSlug,
          eventType: "invalid_request",
          reason: error.message,
        },
      });

      return {
        status: error.status,
        body: {
          code: error.code,
          message: error.message,
        },
      };
    }

    await prisma.securityEvent.create({
      data: {
        pluginSlug: requestBody.pluginSlug,
        eventType: "usage_batch_failed",
        reason: error instanceof Error ? error.message : "Usage batch ingestion failed",
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

function safeParseUsageBatchRequest(rawBody: string): PluginUsageBatchInput | null {
  try {
    const payload = JSON.parse(rawBody) as Partial<PluginUsageBatchInput>;
    if (!payload.pluginSlug || !Array.isArray(payload.events)) {
      return null;
    }

    return {
      pluginSlug: payload.pluginSlug,
      events: payload.events,
    };
  } catch {
    return null;
  }
}
