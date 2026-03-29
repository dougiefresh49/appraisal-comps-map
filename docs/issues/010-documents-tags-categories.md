# 010: Documents Page -- Add Tags/Categories for Filtering

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None
**Feedback ref:** User testing feedback on docs/feedback/07-documents-section.md

## Problem

The documents page shows all project documents in a flat list. As the project accumulates documents (subject docs, comp docs for each comp, maps, etc.), the list becomes hard to navigate. Users want to filter documents by section (subject, sale comp 1, land comp 6, etc.).

## Expected Behavior

- Each document can have a `section_tag` (e.g., "subject", "sales-comp-1", "land-comp-3", "neighborhood", etc.)
- The document list has filter chips or a dropdown to filter by tag
- Tags are auto-assigned based on context:
  - Documents added from the subject section get tagged "subject"
  - Documents added from a comp detail page get tagged with the comp type + number (e.g., "sales-comp-1")
  - Documents added from the documents page can have tags manually assigned
- A "View in Drive" eyeball button for each doc (see issue 011)

## Schema Change

Add a `section_tag` column to `project_documents`:

```sql
alter table project_documents add column if not exists section_tag text;
create index if not exists idx_project_documents_section_tag on project_documents(project_id, section_tag);
```

## Affected Files

- `supabase/migrations/011_document_tags.sql` -- add section_tag column
- `src/components/DocumentManager.tsx` -- add filter chips, auto-tag on add
- `src/components/DocumentContextPanel.tsx` -- pass section_tag when adding documents from context
- `src/lib/supabase-queries.ts` -- update document queries to support filtering by tag

## Acceptance Criteria

- [ ] Documents can be tagged with a section identifier
- [ ] Document list has filter chips/dropdown for tags
- [ ] Tags are auto-assigned when adding docs from specific sections
- [ ] Filtering works in both the documents page and the context panel
