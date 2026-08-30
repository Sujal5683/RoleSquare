// POST /api/jobs/process
//
// Called by:
//   - The extract-wizard route after queuing the master AI_EXTRACTION job
//   - A polling interval from the frontend (every 5s while jobs are active)
//   - A Vercel cron (if configured in vercel.json — recommended for production)
//
// Each call runs ONE job cycle: picks up to 8 queued jobs, runs them in
// parallel, then returns. The frontend polling triggers this repeatedly
// until all jobs are done.
//
// maxDuration is set to 300s (5 min) to allow single-row jobs that involve
// large Drive folders (multiple PDFs) to complete without Vercel killing them.
// Each row-level job takes at most ~90s; 8 concurrent rows finish in ~90–120s.

import { NextResponse } from "next/server";
import { processNextJobCycle } from "@/lib/job-runner";

// Vercel/Next.js route segment config — allows up to 5 min for this route
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await processNextJobCycle();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/jobs/process] cycle failed:", error);
    return NextResponse.json({ success: false, error: "Job cycle failed" }, { status: 500 });
  }
}
