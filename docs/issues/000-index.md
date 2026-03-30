# Open Issues Index

Tracked issues for the Appraisal Comps Maps webapp. Each issue file is self-contained with description, affected files, acceptance criteria, complexity, priority, and dependencies.

## Completed Issues (removed)

Issues 001-021 have been resolved and their documents deleted. Remaining work has been extracted into the issues below.

## Quick Reference

| ID | Title | Priority | Complexity | Dependencies |
|----|-------|----------|------------|--------------|
| 016 | Comp UI templates: sales variants, persistence, label sources | Medium | Medium | None |
| 017 | Analysis pages: generation context controls + visual polish | Medium | Medium | None |
| 018 | Photo analysis: move from n8n to webapp | Medium | High | None |

## Parallelization Guide

**Can run in parallel (no dependencies):**
- All issues (016-018) are independent

**Suggested approach:**
- 016 + 017: Can run in parallel (no file overlap -- 016 touches CompUITemplate/CompDetailPage, 017 touches analysis pages + DocumentContextPanel)
- 018: Standalone, high complexity (touches photos server actions, new Gemini integration)
