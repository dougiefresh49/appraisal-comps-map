# 028: Calculated Fields for Comp and Subject Data

**Priority:** High  
**Complexity:** Medium  
**Dependencies:** None (027 improves data sources but is not required to implement core formulas)

## Problem

Many spreadsheet columns are formulas (sale price per AC/SF, land/building ratio, age, etc.). The webapp shows placeholders (e.g., `--`) instead of computed values. Formula references exist in `docs/report-data-spreadsheet/formulas.json` and `docs/report-data-spreadsheet/named-functions.md`; Apps Script utilities (e.g., `AC_TO_SF`, `GET_ZONE_VAL`) define additional helpers.

## Expected Behavior

- New module `src/lib/calculated-fields.ts` implements key formulas as pure TypeScript functions (deterministic, unit-test friendly).
- Comp detail UI, templates, and summary views call these helpers when displaying "generated" metrics.
- Implementation tracks spreadsheet behavior; discrepancies are documented with examples.

## Affected Files

- New: `src/lib/calculated-fields.ts`
- Display components: `CompDetailPage`, `CompUITemplate`, parcel/comp summary tables (as they exist or are added in 030)
- Reference: `docs/report-data-spreadsheet/formulas.json`
- Reference: `docs/report-data-spreadsheet/named-functions.md`
- Reference: [appraisal-bot `ap-bot-utils.js`](https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/ap-bot-utils.js)

## Acceptance Criteria

- [ ] Module exports functions for agreed core metrics (e.g., `AC_TO_SF`, sale price / AC, sale price / SF, land/bld ratio, age from year built -- exact set aligned to product priority).
- [ ] `CompDetailPage` (and/or shared presenter) shows computed values where formulas exist instead of `--` when inputs are present.
- [ ] Division-by-zero and missing inputs handled gracefully (null/undefined, no thrown errors in UI).
- [ ] At least one automated test or snapshot covering representative inputs vs expected outputs.
- [ ] Comment or doc block references spreadsheet named functions / JSON formula IDs for traceability.
