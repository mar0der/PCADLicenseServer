import { NextResponse } from "next/server";
import { BaseRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifySignature } from "@/lib/auth";
import { accessLevelFromBaseRole, DEFAULT_PLUGIN_SLUG } from "@/lib/access-control/compat";

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
          machineName: payload?.machineName ?? null,
          machineFingerprint: payload?.machineFingerprint ?? null,
          eventType: "invalid_signature",
          reason: "Invalid plugin signature during /api/auth/verify",
        },
      });

      return NextResponse.json(
        { allowed: false, message: "Invalid signature" },
        { status: 401 }
      );
    }

    const data = JSON.parse(rawBody) as {
      username?: string;
      machineName?: string;
      machineFingerprint?: string;
      revitVersion?: string;
    };
    const { username, machineName, machineFingerprint, revitVersion } = data;

    if (!username) {
      return NextResponse.json(
        { allowed: false, message: "Username missing" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !user.isActive) {
      const reason = !user ? "User not found" : "User is disabled";

      await prisma.failedAttempt.create({
        data: {
          username,
          machineName: machineName ?? null,
          reason,
          userId: user?.id ?? null,
        },
      });

      await prisma.securityEvent.create({
        data: {
          userId: user?.id ?? null,
          pluginSlug: DEFAULT_PLUGIN_SLUG,
          username,
          machineName: machineName ?? null,
          machineFingerprint: machineFingerprint ?? null,
          eventType: !user ? "unknown_user_attempt" : "disabled_user_attempt",
          reason,
        },
      });

      return NextResponse.json(
        { allowed: false, message: "Access denied" },
        { status: 403 }
      );
    }

    const nextBaseRole = user.baseRole ?? BaseRole.USER;
    const loginTimestamp = new Date();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: loginTimestamp,
        lastLoginAt: loginTimestamp,
        machineName: machineName ?? user.machineName,
        lastMachineName: machineName ?? user.lastMachineName ?? user.machineName,
        lastMachineFingerprint: machineFingerprint ?? user.lastMachineFingerprint,
        lastRevitVersion: revitVersion ?? user.lastRevitVersion,
        baseRole: nextBaseRole,
        accessLevel: accessLevelFromBaseRole(nextBaseRole),
      },
    });

    return NextResponse.json(
      {
        allowed: true,
        accessLevel: accessLevelFromBaseRole(nextBaseRole),
        message: "Access granted",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Verify API Error:", error);
    return NextResponse.json(
      { allowed: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

function safeParse(payload: string): { username?: string; machineName?: string; machineFingerprint?: string } | null {
  try {
    return JSON.parse(payload) as { username?: string; machineName?: string; machineFingerprint?: string };
  } catch {
    return null;
  }
}
