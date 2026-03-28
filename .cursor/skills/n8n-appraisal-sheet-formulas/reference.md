# Sheet names (`sheetName` values)

Use **exact** tab titles as they appear in Google Sheets. When omitting `range` is required, see **Sheet-wide formula fetch** below.

For a full example of workflow output (rows, `variableName` / `value`, column-header keys, formulas as strings starting with `=`), see `docs/mcp-example-output.json` at the repo root. That file uses the **MCP / `get_execution` shape**: a one-element array `[{ "data": [...] }]`. The **webhook** returns the inner part only: `{ "data": [...] }`.

## All tabs

- report-inputs
- summary-significant-facts
- subject
- subject-taxes
- property-identification
- utilities
- improvement-analysis-v2
- improvement-analysis
- improvements-ui
- comp-parcels
- comp-parcel-improvements
- land comps
- land-summary-chart
- land-adjustments
- land-indicated-values
- land-sales-ui
- cost-inputs
- cost-schedule
- sale comps
- sales-summary-chart
- sales-ui
- sales-adjustments
- sales-caprate-chart
- ui-templates
- rentals-adjustments
- sales-indicated-values
- reconciliation
- rental comps
- rent-summary-chart
- adj vals
- rentals-indicated-values
- rentals-ui
- income-schedule--market
- income-schedule--contract
- income-noi-reduction
- reconciliation-chart
- ai-prompts

## Sheet-wide formula fetch (omit `range`)

For these `sheetName` values only, **do not** send `range`; the workflow returns formulas for the entire sheet:

- land comps
- sale comps
- rental comps
- comp-parcels
- comp-parcel-improvements

## Local HTML filenames

Under `docs/examples/report-data-spreasheet--html/`, each export is `{sheetName}.html` with the same spelling and spacing as the list above (e.g. `land comps.html`, `income-schedule--market.html`, `adj vals.html`).
