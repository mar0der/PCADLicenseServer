import { NextResponse } from "next/server";

import { buildHealthStatus } from "@/lib/runtime/status";

export async function GET() {
  return NextResponse.json(buildHealthStatus(), { status: 200 });
}
