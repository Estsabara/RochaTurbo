import type { CitationItem } from "@/lib/types/domain";
import { getServiceSupabaseClient } from "@/lib/supabase/server";
import { createEmbedding, generateRagAnswer } from "@/lib/services/ai";

interface MatchChunkRow {
  chunk_id: string;
  doc_id: string;
  doc_title: string;
  section_hint: string | null;
  chunk_text: string;
  similarity: number;
}

export async function answerWithRag(question: string, history?: Array<{ role: "user" | "assistant"; content: string }>) {
  const embedding = await createEmbedding(question);
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: embedding,
    match_count: 5,
    filter_doc_ids: null,
  });

  if (error) throw error;
  const rows = (data as MatchChunkRow[]) ?? [];

  const contextChunks = rows.map((row) => ({
    chunkText: row.chunk_text,
    sourceLabel: row.doc_title,
    sectionHint: row.section_hint,
  }));

  const answer = await generateRagAnswer({
    userQuestion: question,
    contextChunks,
    conversationHistory: history,
  });

  const citations: CitationItem[] = rows.map((row) => ({
    doc_id: row.doc_id,
    doc_name: row.doc_title,
    section_hint: row.section_hint,
    chunk_id: row.chunk_id,
    similarity: row.similarity,
  }));

  return { answer, citations };
}
