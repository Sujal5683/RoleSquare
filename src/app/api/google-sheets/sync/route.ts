import { NextRequest, NextResponse } from "next/server";
import { SyncEngine } from "@/lib/services/sync-engine";

export async function POST(request: NextRequest) {
  try {
    const { sheetMappingId } = await request.json();

    if (!sheetMappingId) {
      return NextResponse.json({ error: "sheetMappingId required" }, { status: 400 });
    }

    // In a real implementation, you would dispatch this to a background job queue (e.g. BullMQ)
    // For this example, we execute it directly, but do not await if we want it backgrounded, 
    // or we await it to return sync result.
    
    // We will await for simplicity, but acknowledge it should be a background job.
    await SyncEngine.syncMapping(sheetMappingId);

    return NextResponse.json({ success: true, message: "Sync completed successfully" });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
