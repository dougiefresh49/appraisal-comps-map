# Subject Section -- Feedback and Feature Requests

**Priority:** High
**Current pages:** Overview, Improvements, Location Map, Photos

## Summary of Issues

The subject section is missing several critical features: document awareness on the overview page, a flood map viewer, building sketches, cost report display, and the improvements page UI is confusing. The analysis pages (zoning, ownership, etc.) should be moved under the Subject sidebar group since they are all about the subject property.

---

## 1. Subject Overview -- Document Processing Awareness

**Problem:** The Subject Overview page has form fields for editing data but no way to see which documents have been processed or to trigger document processing from this page. The Documents page is the only place to manage documents, which creates a disconnected workflow.

**Feature Request:** Add a toggleable right-side panel (drawer) to the overview page that shows:

- A list of known/expected document types for the subject (deed record, CAD, flood map, engagement doc, etc.)
- For each document:
  - **Green check** -- Processed and current (Drive file `modifiedTime` matches or is older than `processed_at`)
  - **Yellow warning triangle** -- Processed but the Drive file has been modified since last processing (stale)
  - **Red circle** -- Not yet processed
- A "Reprocess" button when status is not current
- An "Add Document" action that navigates to the document section or opens a file picker

**Implementation notes:**
- The right panel component should be reusable (other pages need it too -- analysis pages, comp detail pages)
- The data source is the `project_documents` table filtered by `project_id`
- Staleness check requires comparing `project_documents.processed_at` against Drive file metadata `modifiedTime` (would need a lightweight Drive API call or cached metadata)

---

## 2. Analysis Pages -- Move Under Subject

**Problem:** The sidebar currently has a separate "Analysis" section with Zoning, Ownership, Subject Site Summary, and Highest and Best Use. These are all about the subject property and should be nested under the Subject sidebar group.

**Proposed sidebar structure:**

```
SUBJECT
  Overview
  Improvements
  Location Map
  Photos
  Flood Map          (NEW)
  Building Sketches  (NEW)
  Cost Report        (NEW, conditional)
  Zoning             (MOVED from Analysis)
  Ownership          (MOVED from Analysis)
  Subject Site Summary (MOVED from Analysis)
  Highest and Best Use (MOVED from Analysis)
```

**Implementation:** Move `analysis/*` route pages to `subject/*` routes. Update the sidebar to render these under the Subject section. Remove the Analysis sidebar group entirely.

---

## 3. Flood Map Page (NEW)

**Problem:** There is no way to view the flood map image or the FEMA data in the webapp.

**Feature Request:** Create a new page at `/project/[projectId]/subject/flood-map` with:

- **Image display:** Load and display the flood map image from Drive at `reports/maps/flood.png` (use the `reportMapsFolderId` from the project's folder structure)
- **FEMA data fields** (editable, stored in `subject_data.core`):
  - FEMA Map Number (`FemaMapNum`)
  - FEMA Zone (`FemaZone`)
  - Is Hazard Zone (`FemalsHazardZone`)
  - FEMA Map Date (`FemaMapDate`)
- **Processing status indicator:** Show whether the flood map image has been processed as a `project_document` (type: `flood_map`). If processed, show the green check. If not, offer a button to process it (which would extract the FEMA data via Gemini and populate the fields).
- These FEMA fields should also appear as a section on the Subject Overview page

**Data source:** The FEMA fields are visible in `docs/examples/report-data-spreasheet--html/report-inputs.html` rows with `variableName` values: `FemaMapNum`, `FemaZone`, `FemalsHazardZone`, `FemaMapDate`.

---

## 4. Building Sketches Page (NEW)

**Problem:** Every project has a `subject/sketches/` folder in Drive containing building sketch images (floor plans, site plans). There is no way to view these in the webapp.

**Feature Request:** Create a new page at `/project/[projectId]/subject/sketches` that:

- Lists and displays images from the `subject/sketches/` Drive folder
- Displays them in a grid or gallery view (similar to the photos page but read-only -- no reordering needed)
- Each image can be clicked to view full-size in a lightbox
- Basic metadata: file name, dimensions if available

**Implementation:** Use `listFolderChildren` from `drive-api.ts` to get the folder contents, then render Google Drive thumbnail URLs for each image.

---

## 5. Cost Report Page (NEW, Conditional)

**Problem:** Some projects require a cost approach, which involves a SwiftEstimator cost report. This report is stored as an HTML file in the `reports/cost-report/` folder on Drive. There is no way to view it in the webapp.

**Feature Request:** Create a new sidebar item and page at `/project/[projectId]/subject/cost-report` that:

- **Only appears in the sidebar if the `reports/cost-report/` folder exists** in Drive (check during project discovery or lazily on sidebar render)
- Displays the SwiftEstimator HTML report in an iframe or sanitized HTML container
- Reference: `docs/cost-report-examples/cost swiftestimator.html` shows the expected format -- it is a self-contained HTML file with inline styles and a script that sets `document.body.innerHTML`

**Implementation notes:**
- Download the HTML file from Drive, sanitize it (strip the script, extract the HTML content), and render it
- Or render it in a sandboxed iframe with `srcdoc`
- The cost report data could also be processed via Gemini to extract key values (replacement cost, depreciation, etc.) for use in the knowledge base

---

## 6. Improvements Page -- UI Redesign

**Problem:** The current Improvement Analysis page UI is confusing. It shows raw `ParcelImprovement` fields (Building #, Section #, Gross Building Area, etc.) in a flat card layout with color-coded category filter chips at the top. This does not match the actual spreadsheet layout at all.

The spreadsheet's `improvement-analysis-v2` tab (ref `docs/examples/report-data-spreasheet--html/improvement-analysis-v2.html`) has a very different structure:

- **Rows** are individual improvement characteristics (Property Type, Construction Quality, GBA, Foundation, Roof, Walls, Electrical, HVAC, etc.)
- Each row has: `Label | Type (category dropdown) | Include (checkbox) | Value`
- Categories are color-coded: Improvement Characteristics, Ratios & Parking, Age/Life, Structural Characteristics, Interior Characteristics, Mechanical Systems, Site Improvements, Legal/Conforming Status

**Feature Request:** Redesign the improvements page to match the spreadsheet's `improvement-analysis-v2` layout:

- Display as a vertical list of rows, one per improvement attribute
- Each row: `Label (text) | Category (color badge) | Include (checkbox toggle) | Value (editable text)`
- Rows grouped visually by category with section headers
- Ability to add/remove rows
- The "Include" checkbox determines whether this field appears in the comp UI template
- The "Type" dropdown should match the category options from the spreadsheet

**Data model change:** The current `subject_data.improvements` stores an array of `ParcelImprovement` objects (building-level data). The improvement analysis v2 is a different concept -- it is a flat list of property characteristics. This may need a separate JSONB column on `subject_data` (e.g., `improvement_analysis`) or a rethink of how improvements are structured.

---

## 7. Photos -- n8n Status

**Question:** Is the photos analysis workflow still using n8n or has it been moved to the webapp?

**Current state (from code review):**
- `src/server/photos/actions.ts` still calls `env.N8N_WEBHOOK_BASE_URL + "/subject-photos-analyze"` in the `triggerPhotoAnalysis` function
- `src/app/api/photos/process/route.ts` calls `triggerPhotoAnalysis` which hits n8n
- The `exportInputJson` function has been moved to use Drive API directly (Phase 1 easy win completed)
- **Photo analysis is still n8n-dependent** (Phase 2 of n8n removal, not yet implemented)

**Recommendation:** This should be noted in the plan -- photo analysis is still an n8n dependency. Moving it to the webapp would follow the same pattern as document processing: download images from Drive, send to Gemini for classification/labeling, save results to `photo_analyses` table.

---

## Related Sidebar Changes

After moving analysis pages under Subject and adding new pages, the Subject sidebar group would be:

```
SUBJECT
  Overview
  Improvements
  Location Map
  Photos
  Flood Map
  Building Sketches
  Cost Report (conditional)
  ---
  Zoning
  Ownership
  Subject Site Summary
  Highest and Best Use
```

The divider separates data/asset pages from analysis/writeup pages within the Subject group.
