# 029: Type Definition Sync Check (Gem Prompt vs `parser-type-defs.md`)

**Priority:** Medium  
**Complexity:** Low  
**Dependencies:** None (inform 026; best done after 026 lands or in parallel with prompt work)

## Problem

The Gemini gem prompt in `docs/n8n/gemini-node-prompts/extract-realestate-data-parser.md` may drift from `docs/report-data-spreadsheet/parser-type-defs.md`. Drift causes inconsistent parsing instructions, bad merges, and spreadsheet export bugs.

## Expected Behavior

- Diff type/interface sections in the gem prompt against `parser-type-defs.md`.
- Establish canonical definitions in `parser-type-defs.md` (or explicitly dual-source with automation if preferred).
- Mismatches documented in a short note under `docs/issues/` or inline in gem doc with "resolved" checklist.

## Affected Files

- `docs/report-data-spreadsheet/parser-type-defs.md` — canonical TS interfaces
- `docs/n8n/gemini-node-prompts/extract-realestate-data-parser.md` — aligned prompt types
- Optional: `src/lib/parsing-prompts.ts` once 026 adds it (ensure single source of truth)

## Acceptance Criteria

- [ ] Structured diff performed; list of mismatches (field names, optionality, enums) recorded.
- [ ] `parser-type-defs.md` updated OR gem prompt updated so they agree on canonical shapes.
- [ ] Findings recorded (append to this issue file under a **Sync results** heading, or note "no mismatches" in the PR) so future edits have an audit trail.
- [ ] Any change to parser output types reflected in comp parser / merge code if needed (tracked under 026/027 as appropriate).
