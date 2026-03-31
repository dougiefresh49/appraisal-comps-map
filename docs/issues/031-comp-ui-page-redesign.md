# 031: Comp UI Page Redesign (absorbs 016)

**Priority:** Medium  
**Complexity:** Medium  
**Dependencies:** 028 (template preview and copy flow should show calculated fields); optional overlap with 027 for parcel-aware labels

**Supersedes:** 016 -- Comp UI templates (sales variants, persistence, label sources) is folded into this issue.

## Problem

**From former 016:** `CompUITemplate` lacks sales template variants (Default vs Income), does not persist per project, label dropdowns only use `Object.keys(rawData)` instead of full spreadsheet header union + adjustment values, and comp detail back link is generic.

**From roadmap:** The comp UI page is a flat list of template rows with dropdowns -- hard to use and visually weak. Users need spreadsheet-like output for copy/paste and a proper edit mode for template configuration.

## Expected Behavior

1. **Default view:** Renders the selected template populated with real comp data, styled like spreadsheet output; comp selector + Copy at top.
2. **Edit template mode:** Toggle reveals editor: preview with Comp 1 data, each label is a dropdown, sections allow + / - rows, drag reorder, Save persists config.
3. **016 carry-over:** Sales has two variants (Default / Income); configurations persist per project (`comp_ui_templates` table or JSONB on `projects`); label sources include parsed keys **and** predefined spreadsheet/adj-val headers; comp detail back link is type-specific ("Back to Land Comps", etc.).
4. **Architecture:** Clear split between read-only "reporting" view and editor (e.g., `CompUITemplateEditor.tsx`).

## Affected Files

- `src/components/CompUITemplate.tsx` — redesign / split responsibilities
- New: `src/components/CompUITemplateEditor.tsx` (or equivalent)
- `src/components/CompDetailPage.tsx` — back link text per comp type
- `src/lib/calculated-fields.ts` -- consumption in template output
- Migration or schema update: `comp_ui_templates` JSONB on `projects` or dedicated table
- Reference: `docs/report-data-spreadsheet/sheets-exported--html/adj vals.html` for label universe

## Acceptance Criteria

- [ ] **Sales:** Dropdown (or equivalent) switches Default vs Income template variant.
- [ ] Template row configs persist across reloads (Supabase-backed).
- [ ] Label dropdowns include full expected field set (not only raw parsed keys).
- [ ] Comp detail back link reads "Back to {Land|Sales|Rental} Comps" (exact wording matches product copy).
- [ ] Default view matches spreadsheet-style layout closely enough for copy/paste workflow.
- [ ] Edit mode: add/remove rows, reorder, save; invalid states handled.
- [ ] No loss of existing comp types (land/sales/rentals) in navigation.
