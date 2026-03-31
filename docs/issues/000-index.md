# Open Issues Index

Tracked issues for the Appraisal Comps Maps webapp. Each issue file is self-contained with description, affected files, acceptance criteria, complexity, priority, and dependencies.

## Completed Issues (removed)

Issues **001--021** have been resolved and their documents deleted.

## Quick Reference

| ID | Title | Priority | Complexity | Dependencies |
|----|-------|----------|------------|--------------|
| 016 | *(absorbed into 031; no standalone doc)* | -- | -- | -- |
| 017 | Analysis pages: generation context controls + visual polish | Medium | Medium | None |
| 018 | Photo analysis: move from n8n to webapp | Medium | High | None |
| 022 | Comp parser upsert crash (missing UNIQUE on `comp_id`) | Critical | Low | None |
| 023 | Missing `section_tag` on processed documents (onboarding + panel) | Critical | Low | None |
| 024 | Subject data not populated from notes/CAD/processed documents | Critical | Medium | None |
| 025 | Onboarding: include building sketches for processing | High | Low | None |
| 026 | Parsing quality: upgrade model + prompts to match Gemini gem | High | Medium | 022 |
| 027 | DB schema: `comp_parcels` and `comp_parcel_improvements` | High | Medium | 022 |
| 028 | Calculated fields for comp and subject data | High | Medium | None |
| 029 | Type definition sync (gem prompt vs `parser-type-defs.md`) | Medium | Low | None |
| 034 | Update Gemini models across codebase | High | Low | None |
| 035 | Auto-populate due date (effective date + 21 days) | Low | Low | None |
| 030 | Comp summary tables (land/sales summary charts) | Medium | Medium | 027, 028 |
| 031 | Comp UI page redesign (absorbs 016) | Medium | Medium | 028 |
| 032 | Past report vectorization and comp reuse | Medium | Medium | None |
| 033 | Write comp/subject data back to Google Spreadsheet | Medium | Medium | 026 (028 recommended) |

**File names:** `016` has no file; see `031-comp-ui-page-redesign.md`. Issues **017** and **018** keep their existing filenames.

## Wave Groupings

| Wave | Focus | Issues |
|------|--------|--------|
| **Ongoing** | Analysis + photos (pre-roadmap) | 017, 018 |
| **1 -- Critical / onboarding** | Stability + subject pipeline | 022, 023, 024, 025 |
| **2 -- Data quality** | Parsing, schema, formulas, docs sync, models | 026, 027, 028, 029, 034 |
| **3 -- Features** | Summary UI, comp UI redesign, RAG/comp reuse, sheet push | 030, 031, 032, 033 |

## Parallelization Guide

**Highly parallel (no hard dependencies on other open issues):**

- **017**, **018** -- independent product tracks
- **022**, **023**, **024**, **025** -- Wave 1; touch different areas (migration, onboarding, subject merge, sketches)
- **028** -- calculated fields (implement against current JSONB until 027 lands)
- **029** -- documentation / prompt alignment review
- **034** -- Gemini model update (4 files, no logic changes)
- **032** -- past reports + comp reuse (reuse existing pgvector patterns)

**Order-sensitive or gated:**

- **026** (parsing upgrade) -- best after **022** so comp upserts are reliable while changing parser output
- **027** (parcel tables) -- after **022**; ideally coordinated with **026** so normalized rows get populated from the new `OutputData` shape
- **030** (summary tables) -- after **027** and **028** for normalized parcel data and formula columns (acceptable MVP on JSONB-only only if documented as interim)
- **031** (comp UI redesign) -- after **028** for spreadsheet-like preview; optional coordination with **027** for parcel-aware labels
- **033** (spreadsheet push) -- after **026** for `OutputData` alignment; **028** recommended so pushed values match sheet formulas

**Suggested batches:**

1. **Batch A (stability):** 022 + 023 + 025 in parallel; 024 in parallel if merge conflicts are manageable with 023
2. **Batch B (schema + AI):** 027 + 026 after 022 (026/027 can parallelize once 022 is merged if two owners coordinate)
3. **Batch C (presentation):** 028 alone or with 029; then 030 + 031 after 028

**016 note:** All scope from the former 016 doc lives under **031**; do not recreate issue 016.
