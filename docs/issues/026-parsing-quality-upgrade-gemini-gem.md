# 026: Parsing Quality -- Upgrade Model + Prompts to Match Gemini Gem

**Priority:** High  
**Complexity:** Medium  
**Dependencies:** 022 (comp parser upsert / schema stability recommended before heavy parser changes)

## Problem

The webapp uses `gemini-2.5-flash-lite` with abbreviated prompts. The proven workflow uses `gemini-3.1-pro-preview` (thinking model) with full type definitions, domain rules (generated fields, YesNoUnknown, parking/canopy, parcel merging, etc.), and yields materially better structured output. Prompts should match `docs/n8n/gemini-node-prompts/extract-realestate-data-parser.md` and `docs/report-data-spreadsheet/parser-type-defs.md`.

## Expected Behavior

- New module (e.g., `src/lib/parsing-prompts.ts`) holds full prompts parameterized by parse type: subject, land, sales, rentals.
- Comp/subject **parsing** uses `gemini-3.1-pro-preview` (thinking model); lighter tasks (e.g., raw document text extraction) may remain on flash-lite.
- Prompts embed full TypeScript interfaces from `parser-type-defs.md`, not abbreviated schema snippets.
- Parser supports `OutputData`-style multi-array responses so one run can return comp + parcel + parcel-improvement structures together (aligned with downstream 027).

## Affected Files

- New: `src/lib/parsing-prompts.ts`
- `src/lib/comp-parser.ts` — model selection, prompt wiring, response shape handling
- Reference: `docs/n8n/gemini-node-prompts/extract-realestate-data-parser.md`
- Reference: `docs/report-data-spreadsheet/parser-type-defs.md`

## Acceptance Criteria

- [ ] Parsing prompts centralized and versioned in-repo (full gem-aligned content, parameterized by type).
- [ ] Comp parse path uses upgraded model for structured extraction (per above).
- [ ] Prompts include full interfaces from `parser-type-defs.md` (or generated/embed step that cannot drift silently).
- [ ] Parser consumes multi-part output (comp + parcels + improvements) without losing data in `raw_data`.
- [ ] Spot-check: parse sample land/sales/rental PDFs; output quality matches or exceeds prior flash-lite baseline.
- [ ] Documented fallback / error handling if pro model is rate-limited (optional but preferred).
