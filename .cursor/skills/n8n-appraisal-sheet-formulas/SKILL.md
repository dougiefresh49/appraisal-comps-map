---
name: n8n-appraisal-sheet-formulas
description: Fetches cell formulas from the commercial appraisal Google Sheet via n8n (MCP execute_workflow workflowId jVRwr2YMOAZawPTI or POST to /webhook/get-formulas). Use when implementing spreadsheet logic, debugging formulas, mapping report tabs, or when the user mentions appraisal sheet formulas, n8n get-formulas, or spreadsheetId 1L0ymDuvJ2VyMMDeZ18eLHVa3-BqfSzkTGJRLKC-gheg.
---

# n8n appraisal sheet formulas

## When to use

- Need **formulas** (not just values) from the commercial appraisal Google Sheet.
- Debugging adjustment grids, reconciliation, or any tab that mirrors the live spreadsheet.
- Choosing **A1 ranges** before calling the workflow (optional: inspect local HTML exports first).

## Constants

| Key | Value |
|-----|--------|
| `workflowId` (n8n MCP) | `jVRwr2YMOAZawPTI` |
| `spreadsheetId` | `1L0ymDuvJ2VyMMDeZ18eLHVa3-BqfSzkTGJRLKC-gheg` |
| Webhook URL (HTTP) | `https://dougiefreshdesigns.app.n8n.cloud/webhook/get-formulas` |

Batch multiple `{ sheetName, range? }` entries in a single request’s `inputs` array to reduce workflow runs.

## Range rules

- **Omit `range`** for these `sheetName` values only (workflow returns the full sheet’s formulas): `land comps`, `sale comps`, `rental comps`, `comp-parcels`, `comp-parcel-improvements`.
- For **all other** sheets, include `range` as A1 notation **without** a sheet prefix when you want a subset (e.g. `"range": "A1:C29"`).
- `sheetName` must match the spreadsheet tab name exactly (see [reference.md](reference.md)).

## Request body shape

Top-level JSON (valid JSON only — no comments):

```json
{
  "spreadsheetId": "1L0ymDuvJ2VyMMDeZ18eLHVa3-BqfSzkTGJRLKC-gheg",
  "inputs": [
    { "sheetName": "report-inputs", "range": "A1:C29" },
    { "sheetName": "sale comps" },
    { "sheetName": "comp-parcels" },
    { "sheetName": "comp-parcel-improvements" }
  ]
}
```

## Path A — n8n MCP (`user-n8n-mcp`)

1. **`workflowId`**: use `jVRwr2YMOAZawPTI` for `execute_workflow` and `get_execution`. If execution fails (e.g. workflow duplicated or renamed), fall back to `search_workflows` (e.g. query `get-formulas`) or `get_workflow_details`.
2. **Execute** with `execute_workflow`:

   - `workflowId`: `jVRwr2YMOAZawPTI`
   - `executionMode`: `production` for the published workflow (use `manual` only to test the current editor draft).
   - `inputs`:

   ```json
   {
     "type": "webhook",
     "webhookData": {
       "method": "POST",
       "body": {
         "spreadsheetId": "1L0ymDuvJ2VyMMDeZ18eLHVa3-BqfSzkTGJRLKC-gheg",
         "inputs": []
       }
     }
   }
   ```

   Fill `"inputs"` with the batched sheet/range objects for this run.

3. **Results**: `execute_workflow` returns `executionId` and `status`. If status is not terminal, poll **`get_execution`** with `workflowId` `jVRwr2YMOAZawPTI` and that `executionId` until success or failure. Read the formula payload from **`get_execution`**’s **`data`** field, then **unwrap** it using the rules in **Response shape** below (MCP may nest the same JSON the webhook returns).

## Response shape (`get_execution` / webhook)

The workflow’s logical body is always an object **`{ "data": [ ... ] }`**, where **`data`** is an array of **blocks** (one per entry in your request `inputs`, same order).

**HTTP webhook:** the response body is that object directly:

```json
{ "data": [ /* block, block, ... */ ] }
```

**MCP `get_execution`:** the tool’s `data` field often wraps that object in a **one-element array** (matching a saved n8n execution export):

```json
[ { "data": [ /* block, block, ... */ ] } ]
```

When parsing MCP results: if `get_execution.data` is an array whose first element has a `data` property, use **`result[0].data`** (or loop `[0]`). If it is already `{ "data": ... }`, use **`.data`** directly.

Inside **`data`** (the blocks array):

- Each block is an object whose keys are **table indices** as strings (`"0"`, `"1"`, …). Sheets that split into multiple tables may expose more than one key.
- Each `"0"` / `"1"` value is an **array of row objects**. Keys are **column headers** (or, on tabs like `report-inputs`, fields such as `row_number`, `variableName`, `label`, `value`).
- **Formulas** appear as string values starting with `=` in whichever field holds the cell (often the header name or `value`). Literals are numbers or strings without a leading `=`.

A real sample (MCP-style outer array) is in [mcp-example-output.json](./mcp-example-output.json). Use it when parsing or debugging; exact keys vary by sheet layout.

## Path B — HTTP webhook (fallback)

`POST` to the webhook URL with `Content-Type: application/json` and the same body as `webhookData.body` above. The JSON response body is **`{ "data": [ ... ] }`** (no outer array). See **Response shape** above; [mcp-example-output.json](./mcp-example-output.json) shows the same inner `data` array with an MCP-style wrapper for comparison.

Example:

```bash
curl -sS -X POST 'https://dougiefreshdesigns.app.n8n.cloud/webhook/get-formulas' \
  -H 'Content-Type: application/json' \
  -d '{"spreadsheetId":"1L0ymDuvJ2VyMMDeZ18eLHVa3-BqfSzkTGJRLKC-gheg","inputs":[{"sheetName":"report-inputs","range":"A1:C10"}]}'
```

## HTML layout reference (local)

Static exports of each tab live under the repo folder `docs/report-data-spreadsheet/sheets-exported--html/`. Filename is **`{sheetName}.html`** (spaces preserved, e.g. `sale comps.html`). Open in a browser to understand layout and pick ranges.

## Sheet name catalog

Full list and the “omit range” set are in [reference.md](reference.md).
