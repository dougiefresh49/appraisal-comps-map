# 036: Move Comp UI Templates to Dedicated Table

**Priority:** High
**Complexity:** Medium
**Dependencies:** None (supersedes the `comp_ui_templates` JSONB column added in migration 019)

## Problem

Migration 019 added a `comp_ui_templates` JSONB column to the `projects` table. This is brittle:
- Base/default templates have no home without a project
- Multiple template variants per comp type (e.g., Sales Default + Sales Income) make the JSONB structure nested and awkward
- Large template configs bloat the projects row which is queried frequently
- No way to query templates independently (e.g., "all Income templates")

## New Schema

Create a `comp_ui_templates` table:

```sql
create table if not exists comp_ui_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,  -- nullable for base/default templates
  comp_type text not null check (comp_type in ('Land', 'Sales', 'Rentals')),
  template_type text not null default 'DEFAULT' check (template_type in ('DEFAULT', 'INCOME')),
  content jsonb not null default '[]',  -- array of template sections, each with title + rows
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, comp_type, template_type)
);
```

The `content` JSONB structure is an array of sections:
```json
[
  {
    "title": "Property Information",
    "rows": [
      { "label": "Address", "fieldKey": "Address", "include": true },
      { "label": "APN", "fieldKey": "APN", "include": true }
    ]
  },
  {
    "title": "Sale Information",
    "rows": [...]
  }
]
```

The UNIQUE constraint on `(project_id, comp_type, template_type)` allows upsert. `project_id = null` rows serve as the global defaults (seeded once).

## Migration Steps

1. Create new migration with the table above + RLS + triggers + Realtime
2. Seed default template rows (project_id = null) for Land/DEFAULT, Sales/DEFAULT, Sales/INCOME, Rentals/DEFAULT using the existing `getDefaultTemplateRows()` logic
3. Drop the `comp_ui_templates` column from `projects` (or leave it and ignore -- dropping is cleaner)

## Code Changes

- Update `CompUITemplate.tsx` to read/write from the new table instead of `projects.comp_ui_templates`
- On load: query `comp_ui_templates` WHERE project_id = current project AND comp_type AND template_type. If no row, fall back to the default (project_id IS NULL).
- On save: upsert into the table with the project_id set
- Add a `useCompUITemplate(projectId, compType, templateType)` hook or inline the query

## Acceptance Criteria

- [ ] New `comp_ui_templates` table created with RLS, triggers, Realtime
- [ ] Default templates seeded (project_id = null) for all comp types + variants
- [ ] `CompUITemplate.tsx` reads from the new table (project-specific first, then default fallback)
- [ ] Save writes to the new table (upsert with project_id)
- [ ] Sales template variant dropdown works with the new structure
- [ ] `projects.comp_ui_templates` column removed or ignored
- [ ] `pnpm build` passes
