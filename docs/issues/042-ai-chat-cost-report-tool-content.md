# 042 — AI chat cost approach tool cannot read cost report content

**Status:** Open  
**Priority:** Medium  
**Complexity:** TBD  

## Reference

Example conversation where the problem showed up:

- **`chat_messages.id`:** `480424c2-c43e-4ab7-9db7-e020b80fcf4c`

Use this row (and its `thread_id` / surrounding messages) to reproduce or analyze what the model and tools returned.

## Background

The Gemini chat stack exposes a read tool **`get_cost_report_html`** (`src/lib/chat-tools.ts`) that should load the SwiftEstimator-style cost report HTML from Google Drive (`projects.folder_structure.costReportFolderId`), strip scripts/styles, optionally truncate to `MAX_COST_REPORT_HTML_CHARS` (80k), and return it in the tool result for the model.

Users can still hit cases where the assistant **cannot actually use** the cost report content—e.g. tool errors (no folder, no HTML files, Drive auth), empty or unusable HTML after processing, truncation hiding key sections, wrong file chosen (latest `modifiedTime` only), or the model not grounding answers in the returned `html` field.

## What needs to happen

1. **Reproduce** using the referenced `chat_messages` row: confirm tool call args, `tool_result` payload, and whether `success` / `html` / error `message` explain the failure.
2. **Classify** the failure: Drive/config vs. file selection vs. stripping/truncation vs. model not using tool output.
3. **Fix or harden** as appropriate (document limits, better errors surfaced to the user, chunking/summarization, file selection rules, etc.).

## Key reference files

- `src/lib/chat-tools.ts` — `executeGetCostReportHtml`, `get_cost_report_html` declaration, `MAX_COST_REPORT_HTML_CHARS`, `stripHtmlNoiseForChatModel`
- `src/lib/gemini.ts` — tool execution loop and how tool results are sent back to the model
- Subject **Cost Report** page — same Drive folder / HTML viewing path for comparison
