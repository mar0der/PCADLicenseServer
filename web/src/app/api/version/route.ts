import { NextResponse } from "next/server";

import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "pcad-license-server",
    version: packageJson.version,
    gitSha: process.env.APP_GIT_SHA ?? "unknown",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    time: new Date().toISOString(),
  });
}
