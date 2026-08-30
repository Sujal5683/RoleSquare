import { NextResponse } from "next/server";
import { processNextJobCycle } from "@/lib/job-runner";

export async function POST() {
  try {
    // Vercel serverless functions freeze when the response is returned unless waitUntil is used.
    // However, since we want to guarantee the job runs in a dedicated function instance,
    // we wait for it to finish before returning the response.
    await processNextJobCycle();
    
    return NextResponse.json({ success: true, message: "Job cycle completed successfully." });
  } catch (error) {
    console.error("[api/jobs/process] Failed to process job cycle:", error);
    return NextResponse.json({ success: false, error: "Job cycle failed." }, { status: 500 });
  }
}
