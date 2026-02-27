import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { createEmbedding } from "@/lib/services/ai";
import { logAuditEvent } from "@/lib/services/audit";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

const payloadSchema = z.object({
  title: z.string().min(3),
  source: z.string().min(3),
  version: z.string().optional(),
  section_hint: z.string().optional(),
  domain: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  text: z.string().min(20),
});

function splitIntoChunks(text: string, size = 900) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length; i += size) {
    chunks.push(cleaned.slice(i, i + size));
  }
  return chunks;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await assertAdminRequest(request);
    const body = await request.json();
    const parsed = payloadSchema.parse(body);
    const supabase = getServiceSupabaseClient();

    const { data: doc, error: docError } = await supabase
      .from("knowledge_docs")
      .insert({
        title: parsed.title,
        source: parsed.source,
        version: parsed.version ?? null,
        status: "active",
        metadata_json: {
          domain: parsed.domain ?? "general",
          tags: parsed.tags ?? [],
          priority: parsed.priority ?? 3,
          ...(parsed.metadata ?? {}),
        },
      })
      .select("*")
      .single();
    if (docError) throw docError;

    const chunks = splitIntoChunks(parsed.text);
    const chunkRows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const embedding = await createEmbedding(chunks[i]);
      chunkRows.push({
        doc_id: doc.id,
        chunk_index: i,
        section_hint: parsed.section_hint ?? null,
        chunk_text: chunks[i],
        embedding,
        metadata_json: {
          domain: parsed.domain ?? "general",
          tags: parsed.tags ?? [],
          priority: parsed.priority ?? 3,
        },
      });
    }

    const { error: chunkError } = await supabase.from("knowledge_chunks").insert(chunkRows);
    if (chunkError) throw chunkError;

    await logAuditEvent({
      actor: admin.actor,
      action: "upload_knowledge_document",
      entity: "knowledge_docs",
      entityId: String(doc.id),
      metadata: { chunks: chunkRows.length, title: parsed.title },
    });

    return NextResponse.json({ doc_id: doc.id, chunks: chunkRows.length }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Knowledge upload failed" },
      { status: 500 },
    );
  }
}
