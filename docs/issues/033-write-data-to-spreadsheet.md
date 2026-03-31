# 033: Write Comp / Subject Data Back to Google Spreadsheet

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** 026 (aligned parsing output shape); 028 recommended for generated columns consistency

## Problem

"Push to Sheet" is not implemented. The existing Apps Script `processJsonData` importer has limitations: no partial update logic (insert-only, assumes all data exists on import), hard to maintain, and cannot handle single-field edits. A custom write system using Google Sheets API directly is needed.

## Use Cases

1. **Partial comp update:** Edit land comp 3's comments in the app, push just that comp's changed fields to the spreadsheet.
2. **Formula override:** User overwrites a formula-derived field in the app; that value writes directly to the cell (replacing the formula).
3. **Summary table labels:** Write the chosen label values for summary chart rows back to the spreadsheet (see issue 030).
4. **Template config:** Write comp UI template label selections back to the `ui-templates` sheet so the Apps Script [`generateStandardLandUI`](https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/ui-templates.js#L29) / [`generateStandardSalesUI`](https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/ui-templates.js#L52) / `generateIncomeSalesUI` functions render correctly. User triggers those functions manually from the spreadsheet menu after template data is pushed.
5. **Subject data:** Push subject overview fields to the `subject` sheet tab.

## UI Pattern: Per-Section Push Buttons

Each page gets its own "Push to Sheet" button with a confirmation dialog showing what will be written and to which sheet/range:

- **Comp detail page** -- pushes that comp's data to the correct comp tab row
- **Summary table** -- pushes summary label config to the summary chart sheet
- **Comp UI template page** -- pushes template config to the `ui-templates` sheet
- **Subject overview** -- pushes subject data to the `subject` sheet tab

## Implementation

- New `src/lib/sheets-api.ts` module for Google Sheets API write operations (using user's OAuth token, `spreadsheetId` from project record):
  - `writeCompToSheet(spreadsheetId, comp, type)` -- maps comp fields to the correct sheet tab and row
  - `writeSummaryLabels(spreadsheetId, labels, type)` -- writes summary chart label config
  - `writeTemplateConfig(spreadsheetId, template, type)` -- writes template selections to `ui-templates` sheet
  - `writeSubjectToSheet(spreadsheetId, subjectData)` -- writes subject fields to `subject` sheet tab
- Each function maps app field names to sheet column positions using the header row (or known column mapping from `docs/report-data-spreadsheet/formulas.json`).
- **Partial writes:** Only touched/changed fields are written, not the entire row. Uses `spreadsheets.values.update` with specific ranges.
- API routes under `src/app/api/spreadsheet/` for each push type.

## Affected Files

- New: `src/lib/sheets-api.ts`
- New: `src/app/api/spreadsheet/push-comp/route.ts`
- New: `src/app/api/spreadsheet/push-summary/route.ts`
- New: `src/app/api/spreadsheet/push-template/route.ts`
- New: `src/app/api/spreadsheet/push-subject/route.ts`
- UI: Push buttons on `CompDetailPage`, `CompSummaryTable`, `CompUITemplate`, `SubjectDataEditor`
- `src/lib/drive-api.ts` / OAuth patterns -- reuse existing server token helpers
- Reference: [Apps Script ui-templates.js](https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/ui-templates.js), `docs/report-data-spreadsheet/formulas.json`

## Acceptance Criteria

- [ ] Per-section push buttons visible on comp detail, summary table, template, and subject pages.
- [ ] Confirmation dialog shows what will be written before executing.
- [ ] Partial comp update: changing one field and pushing writes only that cell (not the whole row).
- [ ] Formula override: pushing a manually-entered value replaces the formula in the target cell.
- [ ] Summary label push writes to the correct summary chart sheet range.
- [ ] Template config push writes to `ui-templates` sheet so Apps Script functions work.
- [ ] Subject data push writes to `subject` sheet tab.
- [ ] User-visible error messages when OAuth, sheet ID, or write fails.
- [ ] Security: only project members can push data for that project's `spreadsheet_id`.
