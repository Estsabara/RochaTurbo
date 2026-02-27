import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    await assertAdminRequest(request);
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase.rpc("run_retention_cleanup");
    if (error) throw error;
    return NextResponse.json({ result: data });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute retention cleanup" },
      { status: 500 },
    );
  }
}
