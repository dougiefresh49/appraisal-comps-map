# n8n MCP: Webhook “parameters” vs POST body fields

Notes from exercising **user-n8n-mcp** while trying to add a string field `projectId` to the workflow **`[Manual] photos labeling knowledge backfill`** (workflow id `7wDjrBUfjDHNsbUb`).

## Workflow and trigger

- **Name:** `[Manual] photos labeling knowledge backfill`
- **ID:** `7wDjrBUfjDHNsbUb`
- **Webhook node:** POST, path `a517c9fd-6b84-45f3-bfff-53f8754b0484`
- **Production URL:** `https://dougiefreshdesigns.app.n8n.cloud/webhook/a517c9fd-6b84-45f3-bfff-53f8754b0484`

## Finding: Webhook node does not declare JSON body fields

`get_node_types` for **`n8n-nodes-base.webhook` (v2.1)** and the [official Webhook node docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) cover HTTP method, path, authentication, how/when to respond, and options (CORS, raw body, etc.). There is **no** parameter type that lists or schemas expected POST JSON keys.

Incoming payload is available on the trigger item as **`$json.body`** (along with headers, query, etc.). Turning body keys into top-level item fields is done in a **downstream** node (commonly **Edit Fields / Set**).

In this workflow, **`WH Body - Extract`** already maps `projectFolderId` from `={{ $json.body.projectFolderId }}`. To support **`projectId`**, add a second assignment there—for example:

- **Name:** `projectId`
- **Value:** `={{ $json.body.projectId }}`
- **Type:** string

## MCP tools used and results

| Tool | Result |
|------|--------|
| `search_workflows` (query: photos labeling knowledge backfill) | Single match; id `7wDjrBUfjDHNsbUb`; `availableInMCP: true` |
| `get_workflow_details` | Full nodes/connections; Webhook + `WH Body - Extract` as above |
| `get_node_types` (`n8n-nodes-base.webhook`, 2.1) | Confirms no body-field definitions on the Webhook node |
| `execute_workflow` | Manual execution with `inputs.type: "webhook"` and `webhookData.body` containing both `projectFolderId` and `projectId` completed with **success** (extra body keys are accepted) |
| `validate_workflow` | Smoke test with a minimal webhook-only workflow: **valid** |
| `update_workflow` | Expects **full** Workflow SDK source for the **entire** graph after `validate_workflow`; not a single-node JSON patch. Practical path: export workflow JSON → `@n8n/workflow-sdk` `json-to-code` (or equivalent) → edit → `validate_workflow` → `update_workflow`, or edit in the n8n UI |

## Takeaway

- **“Add a parameter to the webhook”** in n8n usually means **what callers put in the POST body** plus **how the next node maps `$json.body`**—not a new field on the Webhook node’s parameter panel.
- **`update_workflow` via MCP** is for whole-workflow SDK code, so small edits are often faster in the editor unless you automate JSON → SDK → validate → update.

## Date

Findings recorded: **2026-03-31**.
