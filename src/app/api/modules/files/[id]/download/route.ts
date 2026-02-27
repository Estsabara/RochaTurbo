import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

interface ModuleFileDownloadContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: ModuleFileDownloadContext) {
  try {
    await assertAdminRequest(request);
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "File id is required" }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const { data: file, error: fileError } = await supabase
      .from("generated_files")
      .select("id, file_name, content_type, storage_bucket, storage_path")
      .eq("id", id)
      .single();

    if (fileError) throw fileError;

    const { data: blob, error: downloadError } = await supabase
      .storage
      .from(String(file.storage_bucket))
      .download(String(file.storage_path));

    if (downloadError) throw downloadError;

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": String(file.content_type || "application/octet-stream"),
        "Content-Disposition": `attachment; filename="${String(file.file_name || "arquivo")}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download generated file" },
      { status: 500 },
    );
  }
}
