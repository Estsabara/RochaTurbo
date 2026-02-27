import { NextRequest, NextResponse } from "next/server";
import { assertInternalJobRequest } from "@/lib/http/internal-job-auth";
import { enqueueInternalJob } from "@/lib/queue/enqueue";
import { runInternalJob } from "@/lib/services/internal-jobs";

export async function POST(request: NextRequest) {
  try {
    const context = await assertInternalJobRequest(request);
    const queued = await enqueueInternalJob("retention", {}, context.actor);

    if (queued) {
      return NextResponse.json({ queued: true, job: "retention" }, { status: 202 });
    }

    const result = await runInternalJob("retention");
    return NextResponse.json({ queued: false, result });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run retention job" },
      { status: 500 },
    );
  }
}
