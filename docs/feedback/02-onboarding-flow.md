# New Project Onboarding Flow

**Priority:** High
**Current state:** The "new project" flow calls the old n8n workflow `_POST_Get_Project_Page_Data` (`iVTYnNvW4O6w83qx`) which returns minimal data formatted for the old localStorage-based UI. This needs to be replaced with a proper onboarding wizard that runs entirely in the webapp.

## Current Flow (Broken)

1. User clicks "New Project"
2. User selects a Google Drive folder from a list (this part works)
3. App calls n8n `project-data` webhook with `projectFolderId`
4. n8n navigates the folder, finds the spreadsheet, pulls minimal comp data (land, sales, rentals) and subject/client info
5. Data is returned in the old format that no longer matches the new Supabase schema

## Proposed Onboarding Flow

The new flow should be a multi-step wizard that replaces n8n with direct Drive API calls and Gemini processing. The wizard would run inside a modal or dedicated page after the user selects their project folder.

### Step 1: Select Project Folder (exists)

- User sees list of available Drive folders
- Selects the one for this project
- App creates the `projects` row in Supabase with the `project_folder_id`

### Step 2: Discover Project Structure

Using the user's OAuth token and `src/lib/drive-api.ts`, the app should:

- Navigate the selected folder to find and store key subfolder IDs:
  - `subject/` folder ID
  - `subject/photos/` folder ID
  - `subject/sketches/` folder ID (if exists)
  - `reports/` folder ID
  - `reports/maps/` folder ID (for neighborhood.png, flood.png, location.png, zoning.png)
  - `reports/cost-report/` folder ID (if exists)
  - `comps/land/`, `comps/sales/`, `comps/rentals/` folder IDs
  - `engagement-docs/` folder ID
- Find the Google Spreadsheet file ID inside the project folder (the report data spreadsheet)
- Store all discovered IDs on the project record (new columns or a `folder_structure` JSONB column on `projects`)

**n8n dependency removed:** The folder structure discovery that `_POST_Get_Project_Page_Data` does via sub-workflows (`_GET_Project_Subfolder_Ids`, `_GET_Report_Data_FileId`) would be replaced by direct Drive API calls in the webapp.

### Step 3: Parse Engagement Document

- Show the user a list of files in the `engagement-docs/` folder
- Prompt user to select the engagement letter/document PDF
- Process with Gemini to extract:
  - Client name
  - Client company name
  - Property address
  - Effective date of appraisal
  - Report due date
  - Scope of work / property type
  - Any other relevant engagement details
- Present extracted data to user for confirmation/editing
- Save confirmed data to the `projects` table and seed the `subject_data.core` record

### Step 4: Subject Document Selection

- Show user the files in the `subject/` folder
- Prompt them to select which documents to process for initial context:
  - CAD PDF (property tax appraisal data)
  - Deed record
  - Flood map
  - Any other documents
- Queue selected files for processing via the existing document processing pipeline (`src/server/documents/actions.ts`)
- These become entries in `project_documents` with extracted text and embeddings

### Step 5: Confirmation

- Show a summary of what was set up:
  - Project name / address
  - Client info
  - Discovered folder structure
  - Documents queued for processing
- User confirms, and is redirected to the project dashboard

## Schema Changes Needed

### Option A: Add columns to `projects` table

```sql
alter table projects add column if not exists folder_structure jsonb default '{}';
alter table projects add column if not exists spreadsheet_id text;
alter table projects add column if not exists engagement_folder_id text;
```

The `folder_structure` JSONB would store:

```json
{
  "subjectFolderId": "...",
  "subjectPhotosFolderId": "...",
  "subjectSketchesFolderId": "...",
  "reportsFolderId": "...",
  "reportMapsFolderId": "...",
  "costReportFolderId": "...",
  "engagementFolderId": "...",
  "compsFolderIds": {
    "land": "...",
    "sales": "...",
    "rentals": "..."
  }
}
```

### Option B: Individual columns (more queryable)

Add individual nullable text columns for each folder ID. More verbose but allows direct SQL filtering.

**Recommendation:** Option A (`folder_structure` JSONB) is simpler and more flexible since the folder structure may vary between projects.

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/app/projects/new/page.tsx` | Rewrite to be the onboarding wizard |
| `src/lib/project-discovery.ts` | New -- Drive folder structure discovery logic |
| `src/lib/engagement-parser.ts` | New -- Gemini prompt for engagement doc extraction |
| `src/app/api/projects/discover/route.ts` | New -- API route for folder discovery |
| `src/app/api/projects/parse-engagement/route.ts` | New -- API route for engagement doc parsing |
| `supabase/migrations/009_*.sql` or `010_*.sql` | Add `folder_structure`, `spreadsheet_id` to projects |

## n8n Workflows to Deprecate

| Workflow | ID | Replacement |
|----------|-----|------------|
| `_POST_Get_Project_Page_Data` | `iVTYnNvW4O6w83qx` | In-app folder discovery + engagement parsing |
| `_GET_Project_Subfolder_Ids` | `riAFXAxXWS7tszk3` | `src/lib/project-discovery.ts` |
| `_GET_Report_Data_FileId` | `Tep8CtzA1FaIcRBs` | Folder search in `project-discovery.ts` |
| `report_data_extract_subject` | `i6effpesMXFKBYYb` | Engagement parser / subject overview editor |
| `report_data_extract_client` | `QNCLMd4a3ikdxjey` | Engagement parser |
