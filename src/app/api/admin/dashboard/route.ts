import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase.rpc("get_dashboard_metrics");
    if (error) throw error;
    return NextResponse.json({ metrics: data });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch dashboard metrics" },
      { status: 500 },
    );
  }
}
