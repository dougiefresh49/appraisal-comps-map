-- ============================================================
-- Vector similarity search functions for pgvector
-- ============================================================

-- Search report sections by embedding similarity
create or replace function search_similar_report_sections(
  query_embedding extensions.vector(768),
  match_section_key text default null,
  match_limit int default 5,
  similarity_threshold float default 0.3
)
returns table (
  id uuid,
  project_id uuid,
  section_key text,
  content text,
  version int,
  property_type text,
  city text,
  county text,
  subject_address text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    rs.id,
    rs.project_id,
    rs.section_key,
    rs.content,
    rs.version,
    rs.property_type,
    rs.city,
    rs.county,
    rs.subject_address,
    1 - (rs.embedding <=> query_embedding) as similarity
  from report_sections rs
  where rs.embedding is not null
    and (match_section_key is null or rs.section_key = match_section_key)
    and 1 - (rs.embedding <=> query_embedding) > similarity_threshold
  order by rs.embedding <=> query_embedding
  limit match_limit;
end;
$$;

-- Search project documents by embedding similarity
create or replace function search_similar_documents(
  query_embedding extensions.vector(768),
  match_document_type text default null,
  match_limit int default 5,
  similarity_threshold float default 0.3
)
returns table (
  id uuid,
  project_id uuid,
  document_type text,
  document_label text,
  extracted_text text,
  structured_data jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    pd.id,
    pd.project_id,
    pd.document_type,
    pd.document_label,
    pd.extracted_text,
    pd.structured_data,
    1 - (pd.embedding <=> query_embedding) as similarity
  from project_documents pd
  where pd.embedding is not null
    and (match_document_type is null or pd.document_type = match_document_type)
    and 1 - (pd.embedding <=> query_embedding) > similarity_threshold
  order by pd.embedding <=> query_embedding
  limit match_limit;
end;
$$;

-- Search knowledge base by embedding similarity
create or replace function search_similar_knowledge(
  query_embedding extensions.vector(768),
  match_gem_name text default null,
  match_content_type text default null,
  match_limit int default 5,
  similarity_threshold float default 0.3
)
returns table (
  id uuid,
  gem_name text,
  content_type text,
  input text,
  output text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    kb.id,
    kb.gem_name,
    kb.content_type,
    kb.input,
    kb.output,
    1 - (kb.embedding <=> query_embedding) as similarity
  from knowledge_base kb
  where kb.embedding is not null
    and (match_gem_name is null or kb.gem_name = match_gem_name)
    and (match_content_type is null or kb.content_type = match_content_type)
    and 1 - (kb.embedding <=> query_embedding) > similarity_threshold
  order by kb.embedding <=> query_embedding
  limit match_limit;
end;
$$;
