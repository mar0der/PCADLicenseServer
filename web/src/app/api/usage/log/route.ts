import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySignature } from "@/lib/auth";
import { DEFAULT_PLUGIN_SLUG } from "@/lib/access-control/compat";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("X-Plugin-Signature");

    if (!verifySignature(rawBody, signature)) {
      const payload = safeParse(rawBody);
      await prisma.securityEvent.create({
        data: {
          pluginSlug: DEFAULT_PLUGIN_SLUG,
          username: payload?.username ?? null,
          eventType: "invalid_signature",
          reason: "Invalid plugin signature during /api/usage/log",
          details: payload?.commandKey ?? payload?.functionName ?? null,
        },
      });

      return new NextResponse("Unauthorized", { status: 401 });
    }

    const data = JSON.parse(rawBody) as {
      username?: string;
      functionName?: string;
      commandKey?: string;
      snapshotId?: string;
      pluginSlug?: string;
    };
    const username = data.username;
    const commandKey = data.commandKey ?? data.functionName;

    if (!username || !commandKey) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (user && user.isActive) {
      await prisma.usageLog.create({
        data: {
          userId: user.id,
          pluginSlug: data.pluginSlug ?? DEFAULT_PLUGIN_SLUG,
          functionName: commandKey,
          commandKey,
          snapshotId: data.snapshotId ?? null,
        },
      });
      return new NextResponse("Logged", { status: 200 });
    }

    await prisma.failedAttempt.create({
      data: {
        username,
        userId: user?.id ?? null,
        reason: `Unauthorized Tool Execution: ${commandKey}`,
      },
    });

    await prisma.securityEvent.create({
      data: {
        userId: user?.id ?? null,
        pluginSlug: data.pluginSlug ?? DEFAULT_PLUGIN_SLUG,
        username,
        eventType: user ? "disabled_user_attempt" : "unknown_user_attempt",
        reason: `Unauthorized Tool Execution: ${commandKey}`,
      },
    });

    return new NextResponse("Ignored", { status: 200 });
  } catch (error) {
    console.error("Usage Log API Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

function safeParse(payload: string): { username?: string; functionName?: string; commandKey?: string } | null {
  try {
    return JSON.parse(payload) as { username?: string; functionName?: string; commandKey?: string };
  } catch {
    return null;
  }
}
