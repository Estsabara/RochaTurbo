create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count integer default 5,
  filter_doc_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  doc_id uuid,
  doc_title text,
  section_hint text,
  chunk_text text,
  similarity double precision
)
language sql
stable
as $$
  select
    kc.id as chunk_id,
    kc.doc_id,
    kd.title as doc_title,
    kc.section_hint,
    kc.chunk_text,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  join public.knowledge_docs kd on kd.id = kc.doc_id
  where kd.status = 'active'
    and (filter_doc_ids is null or kc.doc_id = any(filter_doc_ids))
  order by kc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_knowledge_chunks(vector, integer, uuid[]) to authenticated, service_role;
