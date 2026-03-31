# 030: Comp Summary Tables (Land / Sales Summary Charts)

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** 027, 028 (normalized parcel data + calculated fields improve accuracy of summary columns)

## Problem

Spreadsheet summary charts (`land-summary-chart`, `sales-summary-chart`) show key metrics across all comps in a compact table. The webapp comp list lacks an equivalent cross-comp summary, forcing users back to Sheets for portfolio-level review.

## Layout

The table reads **left-to-right, top-to-bottom**: labels in column A, comp values in columns B onward (one column per comp), comp number in row 1. This mirrors the spreadsheet exactly.

## Expected Behavior

- New `CompSummaryTable` component renders configurable rows and one column per comp.
- Data sourced from `comp_parsed_data.raw_data` with calculated fields (028) for formula columns.
- Placed on comp list views (below cards) or a dedicated Summary tab.
- **Row labels are dropdown-selectable** using the same column-header sources as the spreadsheet:
  - Sales: `=CompsSales[[#HEADERS],[Address]:[Potential Value]]` (all column headers from the sales comps table)
  - Land: `=CompsLand[[#HEADERS],[Address]:[Comments]]` (all column headers from the land comps table)
- Users can **add rows** (via a "+" button) and **remove rows** (via a "-" button) -- sometimes more rows are needed, sometimes fewer.
- Default row set matches the spreadsheet summary charts: Sale #, Address, Property Rights, Date of Sale, Land Size (AC), Building Size (SF), Sale Price / SF, Sale Price / SF (Adj), Land / Bld Ratio, Age, Condition, Year Built, Office %, Zoning.
- Summary table configuration (which labels, row order, row count) should be **persisted per project** (e.g., JSONB on `projects` or a dedicated table).

## Affected Files

- New: `src/components/CompSummaryTable.tsx`
- Comp list pages: `src/app/project/[projectId]/land-sales/`, `sales/`, `rentals/` (as applicable to comp types)
- `src/lib/calculated-fields.ts` -- consumers of computed metrics
- Optional: `src/lib/supabase-queries.ts` if batch loading comps + parsed data is centralized

## Acceptance Criteria

- [ ] Summary table renders for at least land and sales comp lists (rentals if data model supports same rows).
- [ ] Layout is labels-left, comp-columns-right, matching spreadsheet orientation.
- [ ] Row labels are selectable from a dropdown of available field names (sourced from comp data headers).
- [ ] Users can add and remove rows from the table.
- [ ] Columns align one-per-comp; horizontal scroll or responsive pattern for many comps.
- [ ] Calculated fields (028) used where spreadsheet uses formulas (price/SF, ratios, age, etc.).
- [ ] Summary table config persists across page reloads (saved per project).
- [ ] Empty state when no comps or no parsed data.
