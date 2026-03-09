import { NextResponse } from "next/server";

import { buildVersionStatus } from "@/lib/runtime/status";

export async function GET() {
  return NextResponse.json(buildVersionStatus(), { status: 200 });
}
