# 034: Update Gemini Models Across Codebase

**Priority:** High
**Complexity:** Low
**Dependencies:** None (can be done independently; 026 covers the comp-parser model separately)

## Problem

All Gemini calls currently use `gemini-2.5-flash-lite` which is outdated. The codebase should use current models matched to task complexity.

## Model Strategy

| Model | Use Case | Files |
|-------|----------|-------|
| `gemini-3.1-pro-preview` | Comp/subject parsing only (heavy reasoning with full type defs) | `src/lib/comp-parser.ts` (covered by issue 026) |
| `gemini-3.1-flash-lite-preview` | Most tasks: document text extraction, report generation, engagement parsing, backfill. Cost-efficient, fast, beats older 2.5 Flash on performance. | `src/lib/gemini.ts`, `src/lib/engagement-parser.ts`, `src/app/api/seed/backfill-reports/route.ts` |
| `gemini-3-flash-preview` | Reserved for future tasks needing higher reasoning than flash-lite but not full pro (coding, agentic workflows). Not currently used but documented for reference. | N/A currently |

## Affected Files

- `src/lib/gemini.ts` -- change `GENERATION_MODEL` from `"gemini-2.5-flash-lite"` to `"gemini-3.1-flash-lite-preview"`
- `src/lib/engagement-parser.ts` -- change `MODEL` from `"gemini-2.5-flash-lite"` to `"gemini-3.1-flash-lite-preview"`
- `src/app/api/seed/backfill-reports/route.ts` -- change inline `"gemini-2.5-flash-lite"` to `"gemini-3.1-flash-lite-preview"`
- `src/lib/comp-parser.ts` -- change to `"gemini-3.1-pro-preview"` (handled by issue 026, but can be done here if 026 has not started)

## Acceptance Criteria

- [ ] No remaining references to `gemini-2.5-flash-lite` in `src/`
- [ ] `src/lib/gemini.ts` uses `gemini-3.1-flash-lite-preview`
- [ ] `src/lib/engagement-parser.ts` uses `gemini-3.1-flash-lite-preview`
- [ ] `src/app/api/seed/backfill-reports/route.ts` uses `gemini-3.1-flash-lite-preview`
- [ ] `pnpm build` passes
- [ ] Document the model strategy in `AGENTS.md` or a comment in `gemini.ts`
