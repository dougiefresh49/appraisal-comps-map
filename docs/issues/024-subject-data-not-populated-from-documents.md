# 024: Subject Data Not Populated from Notes, CAD, and Processed Documents

**Priority:** Critical  
**Complexity:** Medium  
**Dependencies:** None (pairs well with 023 for correctly tagged docs)

## Problem

Subject `subject_data` merge under-populates several fields:

1. **City / State / Zip blank:** `parseAddressParts` regex expects a `", City, ST ZIP"` style pattern; many addresses do not match. When merge writes `Address`, city/state/zip are not backfilled.
2. **`notes.md` as `"other"`:** `inferDocumentType` returns `"other"` for `notes.md`. The generic `other` extraction prompt and absent `MERGE_MAP` entry for `"other"` mean little or nothing reaches `subject_data.core`.
3. **CAD merge too narrow:** Mapper only sets APN, legal, land size, year built — not city, county, zoning, building size, improvements, etc.

## Expected Behavior

- **`notes` type:** Filename / pattern recognizes notes files; dedicated extraction prompt targets property info, ownership, improvements, client details.
- **Merge:** `MERGE_MAP` in subject-data merge includes `"notes"` with mappings for the extracted fields.
- **CAD:** Mapper expanded for city, county, zoning, building size, construction, and other spreadsheet-aligned fields as appropriate.
- **Address:** After address merges, run improved `parseAddressParts` and backfill city/state/zip when empty; regex handles formats like `331 Angel Trail Odessa, TX 79766` without a leading comma segment.

## Affected Files

- `src/app/projects/new/page.tsx` — if `inferDocumentType` / type wiring lives here or must pass types through onboarding
- `src/lib/document-prompts.ts` — `notes` extraction prompt
- `src/server/subject-data/merge.ts` — `MERGE_MAP`, `cad` mapper, address backfill / `parseAddressParts` improvements (and any shared address util)

## Acceptance Criteria

- [ ] `notes` document type recognized (e.g., `notes` in filename) and no longer routed only through unmapped `"other"` merge path.
- [ ] New `notes` Gemini prompt returns structured fields aligned with merge mappings.
- [ ] `MERGE_MAP` includes `"notes"` and merges into `subject_data.core` (and related JSON paths as designed).
- [ ] CAD merge sets additional fields: at minimum city, county, zoning, building size, construction (per spreadsheet/parser types).
- [ ] Merged `Address` triggers backfill of empty city/state/zip when `parseAddressParts` can derive them.
- [ ] `parseAddressParts` handles at least one additional real-world format (e.g., street city ST ZIP without first comma).
- [ ] Manual test: onboarding sample with notes + CAD yields populated subject core fields where extractable.
