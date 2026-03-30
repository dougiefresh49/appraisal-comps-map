# 016: Comp UI Templates -- Sales Variants, Persistence, Label Sources

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None
**Origin:** Remaining items from feedback/05-comp-sections.md section 3

## Problem

The `CompUITemplate` component works but is missing several features from the original spreadsheet workflow:

1. **Sales has two template variants** (Default and Income) but there is no selector to switch between them.
2. **Templates are not persisted per project** -- they reset to defaults on each page load.
3. **Label dropdowns** use `Object.keys(rawData)` from parsed data instead of the full spreadsheet header set + adjustment values from `adj vals`.
4. **Back link on comp detail** says generic "Back to Comps" instead of type-specific "Back to Land Comps" / "Back to Sales Comps".

## Expected Behavior

1. Sales UI page has a template variant dropdown: "Default" (`UiTemplateSalesDefaultRange`) and "Income" (`UiTemplateSalesIncomeRange`)
2. Template row configurations are saved to Supabase (e.g., a `comp_ui_templates` table or JSONB on `projects`) so they persist across sessions
3. Label dropdowns source from the union of parsed data keys + a predefined list matching spreadsheet headers (ref: `docs/report-data-spreadsheet/sheets-exported--html/adj vals.html`)
4. Comp detail "Back" link includes the type name

## Affected Files

- `src/components/CompUITemplate.tsx` -- add variant selector, persist template rows, enrich label dropdown
- `src/components/CompDetailPage.tsx` -- update back link text to include comp type
- Potentially a new migration for `comp_ui_templates` storage

## Acceptance Criteria

- [ ] Sales UI page has a dropdown to switch between Default and Income templates
- [ ] Template configurations persist across page reloads
- [ ] Label dropdown includes all expected field options (not just parsed data keys)
- [ ] Comp detail back link says "Back to {Type} Comps"
