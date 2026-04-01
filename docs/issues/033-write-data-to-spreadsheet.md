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
6. **New comp insertion:** Push a newly parsed comp that doesn't exist in the sheet yet (append to the bottom of the correct tab).

## UI Pattern: Per-Section Push Buttons

Each page gets its own "Push to Sheet" button with a confirmation dialog showing what will be written and to which sheet/range:

- **Comp detail page** -- pushes that comp's data to the correct comp tab row
- **Summary table** -- pushes summary label config to the summary chart sheet
- **Comp UI template page** -- pushes template config to the `ui-templates` sheet
- **Subject overview** -- pushes subject data to the `subject` sheet tab

## Implementation Details

### Google Sheets API Setup

- Use `googleapis` npm package (Google's official Node.js client) or raw `fetch` with the Sheets REST API
- Auth: use `getGoogleToken()` from `src/utils/supabase/server.ts` -- the user's OAuth token already has the `spreadsheets` scope (added to `signInWithOAuth` in `SupabaseAuthProvider.tsx`)
- `spreadsheetId` comes from `projects.spreadsheet_id` (stored during onboarding discovery)

### Row Finding Strategy

When pushing a comp update, the module needs to find the correct row in the spreadsheet:

1. **Read the header row** (row 1) to get column positions dynamically
2. **Find the comp's row** by matching on `Use Type` + `Recording` (instrument number). These are the unique identifiers in the spreadsheet. Read the `Use Type` and `Recording` columns, find the row where both match.
   - If a comp changes from `Sale` to `Extra` or `Old Report`, the `Use Type` cell is updated in place
3. **Subject** is always row 2 (single subject row below the header)
4. **Summary table labels** only need to write column A from row 2 down (`A2:A{numRows}`)
5. **New comps** not in the sheet: append a new row at the bottom. The spreadsheet's formula columns will auto-calculate once data is present (formulas reference the same row). For formula copy-down, the existing Apps Script `autoFill` pattern copies formulas from the row above -- our Sheets API write should do the same: read the formula cells from the row above the new row, write them into the new row, then overwrite the data cells with actual values.

### Use Type Lifecycle

Comps go through a status lifecycle in the `Use Type` column:
- `Sale` / `Rental` -- active comp in the current report
- `Extra` -- was considered but not used (demoted from Sale)
- `Old Report` -- from a prior report, kept for reference

When starting a new report, all current `Sale` comps get changed to `Old Report` and new comps are imported. The webapp should support changing `Use Type` on the comp detail page and pushing that change to the sheet.

### Field-to-Column Mapping

The mapping is dynamic -- read the header row first, then match field names to column indices:

```typescript
async function getColumnMap(sheets, spreadsheetId, sheetName): Promise<Map<string, number>> {
  // Read row 1 of the sheet
  const headers = await sheets.spreadsheets.values.get({
    spreadsheetId, range: `'${sheetName}'!1:1`
  });
  // Build map: { "Address" => 0, "Sale Price" => 8, ... }
  return new Map(headers.data.values[0].map((h, i) => [h, i]));
}
```

### Sheet Tab Names

From the spreadsheet structure (ref: `docs/report-data-spreadsheet/formulas.json`):

| Comp Type | Data Sheet | Summary Chart Sheet |
|-----------|-----------|-------------------|
| Land | `land comps` | `land-summary-chart` |
| Sales | `sale comps` | `sales-summary-chart` |
| Rentals | `rental comps` | `rent-summary-chart` |
| Subject | `subject` | -- |
| Templates | `ui-templates` | -- |

### Partial Write Logic

Use `spreadsheets.values.update` with `ValueInputOption: 'USER_ENTERED'` (so formulas are preserved for untouched cells):

```typescript
// Write specific cells, not the entire row
async function writeCells(sheets, spreadsheetId, sheetName, row, columnMap, fields) {
  const requests = [];
  for (const [fieldName, value] of Object.entries(fields)) {
    const col = columnMap.get(fieldName);
    if (col === undefined) continue;
    const cellRange = `'${sheetName}'!${colToLetter(col)}${row}`;
    requests.push(
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: cellRange,
        valueInputOption: 'RAW', // RAW for literal values, USER_ENTERED for formulas
        requestBody: { values: [[value]] },
      })
    );
  }
  // Batch or sequential -- sequential is simpler, batch is faster
  await Promise.all(requests);
}
```

For formula overrides, use `RAW` so the value replaces the formula. For normal fields, `RAW` is also fine (it writes the literal value).

### New Comp Insertion

When a comp doesn't exist in the sheet (no matching `Use Type` + `Recording`):

1. Find the last populated row in the target sheet
2. **Copy formulas** from the last populated row into row N+1 (mimics the Apps Script `autoFill` behavior from [json-parser.js](https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/drive-importer/json-parser.js)):
   - Read all cells in the last row
   - For cells that contain formulas (start with `=`), write them into the new row (Sheets API adjusts relative references automatically when using `USER_ENTERED`)
   - For cells that are static values, leave them empty (they'll be overwritten in step 3)
3. **Write the comp data** over the new row using `RAW` mode for the data fields (this overwrites the empty cells but leaves the formula cells intact)

### Bulk Use Type Update (New Report Transition)

When starting a new report, the user needs to change all current `Sale` comps to `Old Report`. Add a utility function:

```typescript
async function markCompsAsOldReport(opts, sheetName, compType): Promise<void>
// Reads all rows, finds those with Use Type = "Sale" (or "Rental"),
// writes "Old Report" to their Use Type cell
```

This could be triggered from a "Start New Report" button or done manually per comp.

### Module: `src/lib/sheets-api.ts`

```typescript
interface SheetsWriteOptions {
  spreadsheetId: string;
  token: string;  // Google OAuth access token
}

// Core functions
export async function getColumnMap(opts, sheetName): Promise<Map<string, number>>
export async function findCompRow(opts, sheetName, useType: string, recording: string): Promise<number | null>
export async function writeCells(opts, sheetName, row, fields): Promise<void>
export async function appendRowWithFormulas(opts, sheetName, fields): Promise<void>
export async function markCompsAsOldReport(opts, sheetName): Promise<number> // returns count updated

// High-level push functions
export async function writeCompToSheet(opts, comp: Record<string, unknown>, type: CompType): Promise<void>
export async function writeSubjectToSheet(opts, subjectData: Record<string, unknown>): Promise<void>
export async function writeSummaryLabels(opts, labels: string[], type: CompType): Promise<void>
export async function writeTemplateConfig(opts, template: unknown[], type: CompType): Promise<void>
```

## Affected Files

- New: `src/lib/sheets-api.ts`
- New: `src/app/api/spreadsheet/push-comp/route.ts`
- New: `src/app/api/spreadsheet/push-summary/route.ts`
- New: `src/app/api/spreadsheet/push-template/route.ts`
- New: `src/app/api/spreadsheet/push-subject/route.ts`
- UI: Push buttons on `CompDetailPage`, `CompSummaryTable`, `CompUITemplate`, `SubjectDataEditor`
- `src/utils/supabase/server.ts` -- reuse `getGoogleToken()` for auth
- Reference: `docs/report-data-spreadsheet/formulas.json` (column structure), [Apps Script ui-templates.js](https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/ui-templates.js)

## Acceptance Criteria

- [ ] Per-section push buttons visible on comp detail, summary table, template, and subject pages.
- [ ] Confirmation dialog shows what will be written before executing.
- [ ] Partial comp update: changing one field and pushing writes only that cell (not the whole row).
- [ ] Formula override: pushing a manually-entered value replaces the formula in the target cell.
- [ ] New comp insertion: appends a new row to the correct sheet tab.
- [ ] Summary label push writes to the correct summary chart sheet range.
- [ ] Template config push writes to `ui-templates` sheet so Apps Script functions work.
- [ ] Subject data push writes to `subject` sheet tab (row 2).
- [ ] Column mapping is dynamic (reads header row, not hardcoded).
- [ ] User-visible error messages when OAuth, sheet ID, or write fails.
- [ ] `pnpm build` passes.
