# Open Issues Index

Tracked issues for the Appraisal Comps Maps webapp. Each issue file is self-contained with description, affected files, acceptance criteria, complexity, priority, and dependencies.

## Completed Issues (removed)

Issues 001-014 have been resolved and their documents deleted. Remaining work from partial completions has been extracted into new issues below.

## Quick Reference

| ID | Title | Priority | Complexity | Dependencies |
|----|-------|----------|------------|--------------|
| 015 | Comp detail: document panel scoping + auto-tagging | High | Low | None |
| 016 | Comp UI templates: sales variants, persistence, label sources | Medium | Medium | None |
| 017 | Analysis pages: generation context controls + visual polish | Medium | Medium | None |
| 018 | Photo analysis: move from n8n to webapp | Medium | High | None |
| 019 | Update product documentation | Low | Low | None |
| 020 | Neighborhood boundary prompt key mismatch | Medium | Low | None |
| 021 | Document manager: enable multi-select in Drive browser | Low | Low | None |

## Parallelization Guide

**Can run in parallel (no dependencies):**
- All issues (015-021) are independent

**Suggested groupings by file overlap:**
- 015 + 016: both touch `CompDetailPage.tsx`
- 017 standalone: touches analysis pages + DocumentContextPanel
- 018 standalone: touches photos server actions (high complexity)
- 019 standalone: docs only, no code changes
- 020 standalone: single file fix (`prompt-builder.ts`)
- 021 standalone: single file fix (`DocumentManager.tsx`)

**Quick wins (Low complexity):**
- 015, 019, 020, 021
