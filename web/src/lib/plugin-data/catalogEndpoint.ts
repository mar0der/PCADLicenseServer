import { type PrismaClient } from "@prisma/client";

import { verifySignature } from "../auth";

import { syncPluginCatalog, type PluginCatalogSyncInput } from "./catalogService";
import { PluginDataError } from "./error";

type CatalogSyncErrorBody = {
  code: string;
  message: string;
};

type ParsedCatalogSyncRequest = {
  catalog: PluginCatalogSyncInput;
  ignoredRibbonTabsCount: number;
  ignoredRibbonPanelsCount: number;
  ignoredRibbonItemsCount: number;
};

export async function handlePluginCatalogSyncRequest(
  prisma: PrismaClient,
  input: {
    rawBody: string;
    signature: string | null;
  }
): Promise<{
  status: number;
  body:
    | CatalogSyncErrorBody
    | (Awaited<ReturnType<typeof syncPluginCatalog>> & {
        ignoredRibbonTabsCount: number;
        ignoredRibbonPanelsCount: number;
        ignoredRibbonItemsCount: number;
      });
}> {
  const requestBody = safeParseCatalogSyncRequest(input.rawBody);

  if (!verifySignature(input.rawBody, input.signature)) {
    await prisma.securityEvent.create({
      data: {
        pluginSlug: requestBody?.catalog.pluginSlug ?? null,
        eventType: "invalid_signature",
        reason: "Invalid plugin signature during /api/plugin/catalog/sync",
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
        reason: "Malformed JSON during /api/plugin/catalog/sync",
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
    const result = await syncPluginCatalog(prisma, requestBody.catalog);
    return {
      status: 200,
      body: {
        ...result,
        ignoredRibbonTabsCount: requestBody.ignoredRibbonTabsCount,
        ignoredRibbonPanelsCount: requestBody.ignoredRibbonPanelsCount,
        ignoredRibbonItemsCount: requestBody.ignoredRibbonItemsCount,
      },
    };
  } catch (error) {
    if (error instanceof PluginDataError) {
      await prisma.securityEvent.create({
        data: {
          pluginSlug: requestBody.catalog.pluginSlug,
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
        pluginSlug: requestBody.catalog.pluginSlug,
        eventType: "catalog_sync_failed",
        reason: error instanceof Error ? error.message : "Catalog sync failed",
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

function safeParseCatalogSyncRequest(rawBody: string): ParsedCatalogSyncRequest | null {
  try {
    const payload = JSON.parse(rawBody) as Partial<
      PluginCatalogSyncInput & {
        ribbonTabs?: unknown[];
        ribbonPanels?: unknown[];
        ribbonItems?: unknown[];
      }
    >;

    if (!payload.pluginSlug) {
      return null;
    }

    return {
      catalog: {
        pluginSlug: payload.pluginSlug,
        commands: payload.commands ?? [],
        iconAssets: payload.iconAssets ?? [],
      },
      ignoredRibbonTabsCount: Array.isArray(payload.ribbonTabs) ? payload.ribbonTabs.length : 0,
      ignoredRibbonPanelsCount: Array.isArray(payload.ribbonPanels) ? payload.ribbonPanels.length : 0,
      ignoredRibbonItemsCount: Array.isArray(payload.ribbonItems) ? payload.ribbonItems.length : 0,
    };
  } catch {
    return null;
  }
}
