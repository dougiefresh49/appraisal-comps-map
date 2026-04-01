# Open Issues Index

Tracked issues for the Appraisal Comps Maps webapp. Each issue file is self-contained with description, affected files, acceptance criteria, complexity, priority, and dependencies.

## Completed Issues (removed)

Issues 001-038 have been resolved and their documents deleted.

## Quick Reference

| ID | Title | Priority | Complexity | Dependencies |
|----|-------|----------|------------|--------------|
| 017 | Analysis pages: generation context controls + visual polish | Medium | Medium | None |
| 018 | Photo analysis: move from n8n to webapp | Medium | High | None |
| 032 | Past report vectorization and comp reuse | Medium | Medium | None |
| 033 | Write comp/subject data back to Google Spreadsheet | Medium | Medium | None |

## Status Notes

- **017** -- Analysis page enhancements (include/exclude checkboxes, photo context, HBU prereqs, timestamps). Pre-existing issue, not yet started.
- **018** -- Move photo analysis from n8n to webapp. Pre-existing issue, not yet started. The n8n photo backfill workflow is working and writes to Supabase directly.
- **032** -- Past report vectorization. Project folder IDs collected (11 projects in `docs/past-reports/project-folder-ids.md`). n8n photo backfill endpoint working. Need: import endpoint for CSV comp data + PDF narrative backfill + comp reuse search UI.
- **033** -- Spreadsheet write-back via Sheets API. OAuth scope added (`spreadsheets`). Need: `sheets-api.ts` module + per-section push buttons.
