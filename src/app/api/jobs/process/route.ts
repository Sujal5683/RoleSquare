// POST /api/jobs/process — backwards-compatible no-op shim.
//
// The BullMQ worker (worker.ts) now handles all job processing.
// This endpoint is kept so that:
//   - The frontend sidebar jobs widget (which POSTs here every ~5s) continues
//     to work without any UI-side changes.
//   - Legacy fetch("/api/jobs/process") calls in API routes don't error.
//
// The response is instant — no DB polling, no job execution here.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ success: true, mode: "bullmq" });
}
