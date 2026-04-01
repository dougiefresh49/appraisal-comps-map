# Agent Prompts

Prompts for Slack -> Cursor cloud agent pipeline. Each prompt includes the slack message ID reference line for the PR review automation chain.

---

## 032-A: Past Report Vectorization -- Backend/Data Layer

**Model:** Sonnet
**Depends on:** Nothing (first in chain)
**Next task after merge:** 032-B

```
@Cursor use Sonnet 4.6 model, for the following task.

Read AGENTS.md for project context.

Task: Issue 032-A -- Past Report Vectorization (Backend/Data Layer)

Read docs/issues/032-past-report-vectorization-comp-reuse.md for the full spec. This task covers Layer 0 (reference projects), Layer A (PDF backfill update), Layer C (CSV import), and Layer D (n8n webhook). NO frontend/UI work in this task.

Step 1 - Migration: Create a new migration adding is_reference boolean DEFAULT false to the projects table. Push with npx supabase db push.

Step 2 - Update backfill endpoint: Update src/app/api/seed/backfill-reports/route.ts to accept an optional project_id in the POST body. When provided, insert report_sections rows with that project_id instead of null.

Step 3 - CSV import endpoint: Create src/app/api/seed/import-csv-comps/route.ts that:
- Reads CSV files from docs/report-data-spreadsheet/sheets-exported--csv/ (use fs.readFileSync + simple CSV parsing, no heavy deps)
- Creates a "Reference Library" project with is_reference = true
- For each row in sale comps CSV and land comps CSV: insert into comparables (id=uuid, project_id, type from filename, number from # column, address, instrument_number from Recording) + insert into comp_parsed_data (comp_id, project_id, raw_data = entire CSV row as JSON object with header keys)
- For each row in comp-parcels CSV: look up comp_id from comparables by instrument_number, insert into comp_parcels with 1:1 column mapping
- For each row in comp-parcel-improvements CSV: look up parcel_id from comp_parcels by instrumentNumber+APN, insert into comp_parcel_improvements
- Handle negative # values (old report comps) -- import them all, assign positive numbers starting from 1

Step 4 - Reference project orchestrator: Create src/app/api/seed/import-old-reports/route.ts that:
- Reads docs/past-reports/project-folder-ids.md (parse the JSON block)
- For each entry: create a projects row with name, project_folder_id, is_reference=true
- For each entry that has a matching PDF in docs/past-reports/: call the updated backfill endpoint with the project_id
- For each entry: fire the n8n webhook (POST to https://dougiefreshdesigns.app.n8n.cloud/webhook/past-report-photo-backfil with project_id + project_folder_id) -- fire and forget

Step 5 - Comp search API: Create src/app/api/comps/search/route.ts that accepts POST { query, type? } and searches comp_parsed_data.raw_data->>'Address' ILIKE '%query%' OR raw_data->>'APN' ILIKE '%query%'. Join with comparables and projects to return comp data + project name. Group results by address to show "Used in: Project A, Project B".

Run pnpm build when done and fix any errors.

When you open the PR, include this in the pr description:
- Note this slack message id
- Add line: NEXT_TASK: 032-B
- Add line: NEXT_TASK_PROMPT_FILE: docs/issues/prompts.md (section "032-B: Comp Reuse Search UI")
```

---

## 032-B: Comp Reuse Search UI

**Model:** Sonnet
**Depends on:** 032-A merged
**Next task after merge:** None

```
@Cursor use Sonnet 4.6 model, for the following task.

Read AGENTS.md for project context.

Task: Issue 032-B -- Comp Reuse Search UI

Read docs/issues/032-past-report-vectorization-comp-reuse.md for the full spec. This task adds the "Search Past Comps" UI to CompAddFlow.tsx. The backend (search API at /api/comps/search) was built in the previous task.

Update src/components/CompAddFlow.tsx to add a "Search Past Comps" tab or button alongside the existing Drive folder picker:

1. Add a search input field that queries POST /api/comps/search with the entered text
2. Display results as a list showing: Address, Sale Price, Date of Sale, Type, and "Used in: Project A, Project B" for each match
3. Each result has a "Clone to Current Project" button that:
   - Creates a new comparables row in the current project (copies address, type, instrument_number)
   - Creates a new comp_parsed_data row with raw_data copied from the source
   - Sets parsed_data_status to "parsed"
   - Redirects to the new comp's detail page
4. Search should debounce (300ms) to avoid excessive API calls
5. Empty state: "Search by address or APN to find comps from past reports"
6. Follow dark-mode-first design patterns (gray-950 bg, gray-900 cards, blue-600 accents)

Run pnpm build when done and fix any errors.

When you open the PR, note this slack message id in the pr description.
```

---

## 033: Write Data to Spreadsheet

**Model:** Sonnet
**Depends on:** Nothing (independent)
**Next task after merge:** None

```
@Cursor use Sonnet 4.6 model, for the following task.

Read AGENTS.md for project context.

Task: Issue 033 -- Write Comp/Subject Data Back to Google Spreadsheet

Read docs/issues/033-write-data-to-spreadsheet.md for the full spec.

Step 1 - Core module: Create src/lib/sheets-api.ts with:
- getColumnMap(opts, sheetName) -- reads header row 1 and returns Map of field name to column index
- findCompRow(opts, sheetName, useType, recording) -- reads Use Type + Recording columns to find the matching row number
- writeCells(opts, sheetName, row, columnMap, fields) -- writes specific cells using spreadsheets.values.update with RAW ValueInputOption
- appendRowWithFormulas(opts, sheetName, fields) -- copies formulas from last row, then writes data fields over it
- markCompsAsOldReport(opts, sheetName) -- finds all rows with Use Type = "Sale" and writes "Old Report"
- writeCompToSheet, writeSubjectToSheet, writeSummaryLabels, writeTemplateConfig -- high-level functions

Auth: use getGoogleToken() from src/utils/supabase/server.ts. The user's OAuth token has the spreadsheets scope. Use fetch() with the Google Sheets REST API v4 (https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}) -- no need for the googleapis npm package.

Sheet tab names: land comps, sale comps, rental comps, subject, ui-templates, land-summary-chart, sales-summary-chart, rent-summary-chart. spreadsheetId comes from the projects table.

Step 2 - API routes: Create these routes under src/app/api/spreadsheet/:
- push-comp/route.ts -- accepts { projectId, compId, fields? }. If fields is provided, partial write. If not, write all non-formula fields.
- push-subject/route.ts -- accepts { projectId }. Writes subject_data.core to row 2 of the subject sheet.
- push-summary/route.ts -- accepts { projectId, type, labels }. Writes label strings to column A of the summary chart sheet.
- push-template/route.ts -- accepts { projectId, type, templateType, sections }. Writes template config to ui-templates sheet.

Step 3 - UI buttons: Add a "Push to Sheet" button (small, secondary style) to:
- src/components/CompDetailPage.tsx -- next to the save/parse buttons
- src/components/SubjectDataEditor.tsx -- next to Save Changes
- src/components/CompSummaryTable.tsx -- in the toolbar area
- src/components/CompUITemplate.tsx -- in the toolbar area

Each button shows a confirmation dialog before executing. On success, show a brief toast/feedback. On error, show the error message.

Run pnpm build when done and fix any errors.

When you open the PR, note this slack message id in the pr description.
```

---

## 018-A: Photo Analysis Module (Remove n8n)

**Model:** Sonnet
**Depends on:** Nothing (independent)
**Next task after merge:** 018-B

```
@Cursor use Sonnet 4.6 model, for the following task.

Read AGENTS.md for project context.

Task: Issue 018-A -- Photo Analysis Module (Backend)

Read docs/issues/018-photo-analysis-remove-n8n.md for the full spec. This task builds the photo-analyzer module and updates the existing photo processing to use it instead of n8n. NO onboarding UI changes in this task.

Step 1 - Create src/lib/photo-analyzer.ts:
- buildSubjectPhotoContext(core) -- formats subject_data.core into a short context string (address, property type, building size, construction, condition, year built, site improvements)
- classifyImage(imageBuffer, mimeType, propertyType, subjectContext) -- sends image to Gemini with the classify prompt from docs/n8n/gemini-node-prompts/image--classify.md. Returns one of: "Site & Grounds", "Building Exterior", "Building Interior", "Residential / Apartment Unit", "Damage & Deferred Maintenance". Use gemini-3.1-flash-lite-preview.
- describeImage(imageBuffer, mimeType, category, label, propertyType, subjectAddress, subjectContext) -- sends image to Gemini with the describe prompt from docs/n8n/gemini-node-prompts/image--generate-description.md. Returns { description, improvements_observed }. Use gemini-3.1-flash-lite-preview.
- analyzePhoto(input: PhotoAnalysisInput) -- orchestrates: download from Drive, resize with sharp, classify, describe, upsert to photo_analyses
- analyzeProjectPhotos(projectId, photosFolderId) -- lists all files in the Drive folder, processes each sequentially (or concurrency 2-3), upserts results to photo_analyses with file_id, sort_order, category, label, description, improvements_observed

Step 2 - Update src/server/photos/actions.ts:
- Replace triggerPhotoAnalysis (which calls n8n) with a call to analyzeProjectPhotos from the new module
- Keep the function signature the same so the API route doesn't need changes
- Load subject_data.core for the project to build the context string

Step 3 - Verify the existing /api/photos/process route still works with the updated triggerPhotoAnalysis.

Run pnpm build when done and fix any errors.

When you open the PR, include this in the pr description:
- Note this slack message id
- Add line: NEXT_TASK: 018-B
- Add line: NEXT_TASK_PROMPT_FILE: docs/issues/prompts.md (section "018-B: Photo Analysis -- Onboarding Integration")
```

---

## 018-B: Photo Analysis -- Onboarding Integration

**Model:** Sonnet
**Depends on:** 018-A merged
**Next task after merge:** None

```
@Cursor use Sonnet 4.6 model, for the following task.

Read AGENTS.md for project context.

Task: Issue 018-B -- Photo Analysis Onboarding Integration

Read docs/issues/018-photo-analysis-remove-n8n.md for the full spec. The photo-analyzer module was built in the previous task. This task adds the onboarding UI integration.

Step 1 - Photos confirmation step: In src/app/projects/new/page.tsx, add a new wizard step between the current subject docs step and the flood map step:
- Shows the subjectPhotosFolderId contents (file list with names and count, e.g., "28 photos found in subject/photos")
- Checkbox: "Auto-import and analyze subject photos" (default: checked)
- Store the checkbox state in component state (e.g., autoImportPhotos)

Step 2 - Processing status modal: After the user clicks Finalize on the confirmation step, instead of immediately redirecting, show a processing status screen/modal that tracks all async tasks:
- "Creating project..." [done]
- "Processing subject documents (X of Y)" [in progress / queued]
- "Processing building sketches (X of Y)" [queued]
- "Analyzing subject photos (X of Y)" [queued] (only if checkbox was checked)
- "Generating ownership analysis" [queued]

Use Supabase Realtime subscriptions on project_documents, photo_analyses, and report_sections for the new project_id to track progress. Show counts as rows appear.

Step 3 - Fire photo analysis: In the handleFinalize function, after document processing is queued, if autoImportPhotos is checked, call POST /api/photos/process with the projectId and projectFolderId. This is fire-and-forget -- the processing status modal tracks progress via Realtime.

Step 4 - Redirect logic: Once all critical tasks complete (documents + sketches processed), redirect to the project dashboard. Photo analysis can continue in the background -- the photos page already shows progress.

Follow dark-mode-first design patterns. Run pnpm build when done and fix any errors.

When you open the PR, note this slack message id in the pr description.
```

---

## 017: Analysis Page Enhancements

**Model:** Sonnet
**Depends on:** Nothing (independent)
**Next task after merge:** None

```
@Cursor use Sonnet 4.6 model, for the following task.

Read AGENTS.md for project context.

Task: Issue 017 -- Analysis Page Enhancements

Read docs/issues/017-analysis-page-enhancements.md for the full spec.

This task adds generation context controls and visual polish to the analysis pages (Zoning, Ownership, Subject Site Summary, Highest and Best Use).

1. Document context panel: Add include/exclude checkboxes to each document row in src/components/DocumentContextPanel.tsx. Excluded documents should be visually dimmed. When regenerating, only checked documents should be passed as context.

2. Report section timestamps: In src/components/ReportSectionContent.tsx or ReportSectionPage.tsx, show "Last generated: [date]" below the content area, sourced from report_sections.updated_at.

3. HBU prerequisite status: On the Highest and Best Use page (src/app/project/[projectId]/analysis/highest-best-use/page.tsx), show the status of prerequisite sections (Zoning, Ownership, Site Summary) -- whether they exist and when they were last generated. Warn if any are empty.

4. Ownership structured facts: On the Ownership page, if subject_data.core has deed-related fields (grantor, grantee, instrumentNumber, purchasePrice, deedType), show them as a structured facts block above the narrative content.

5. Subject Site Summary key facts: On the Site Summary page, show a key facts strip (Land Size, Building Size, Year Built, Condition, Construction) from subject_data.core above the narrative.

Follow dark-mode-first design patterns (gray-950 bg, gray-900 cards, blue-600 accents).
Run pnpm build when done and fix any errors.

When you open the PR, note this slack message id in the pr description.
```

---

## Execution Order

Independent tracks (can run in parallel):
- Track 1: 032-A → (merge) → 032-B
- Track 2: 033
- Track 3: 018-A → (merge) → 018-B
- Track 4: 017

All 4 tracks can start simultaneously. Within tracks 1 and 3, the B task waits for A to merge.
