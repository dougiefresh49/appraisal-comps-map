# Comp Sections (Land Sales, Sales, Rentals) -- Feedback and Feature Requests

**Priority:** High
**Current pages:** `[type]/comparables`, `[type]/comparables-map`, `sales/ui`, `[type]/comps/[compId]/location-map`

## Summary of Issues

The comp pages are still using the old card-based layout from the original implementation. The comp detail page is nearly empty and unhelpful. There is no comp UI page for land or rentals. The comp list page needs significant redesign to support the new add/parse flow and provide direct navigation to individual comps. The comparables map needs multi-user awareness.

---

## Common Issues (Apply to Land, Sales, and Rentals)

### 1. Comps List Page -- Redesign

**Problem:** The comps list page (`[type]/comparables/page.tsx` rendering `ComparablesPageContent.tsx`) still shows the old card layout with address, display address, and APN fields. It displays the project UUID as the page title. The "Refresh Data" button still calls the old n8n `/comps-data` endpoint. The search icon on the address field does a geocode lookup which is a leftover from the map marker placement flow -- it does not belong on the list page.

**Feature requests:**

- **Remove the search/geocode icon** from the address field on the comp list cards. Address geocoding should happen on the map page, not the list page.
- **Replace "Refresh Data" button** with functionality that makes sense for the new flow (e.g., "Sync from Spreadsheet" if we keep that path, or remove it entirely if comps are managed in-app)
- **Show parsed data status** on each comp card: a badge showing `Parsed`, `Processing`, `Not Parsed`, or `Error` based on `comparables.parsed_data_status`
- **Add a banner image/map** at the top of the page showing a static or read-only version of the comparables map (from Drive `reports/maps/{type}.png` or a Google Maps embed), with an "Edit Map" button linking to the map editor page
- **Link each comp to its detail page** -- the "Details" button should navigate to `/project/[projectId]/[type]/comps/[compId]`
- **List individual comps in the sidebar** under the type's Comps item, so users have direct navigation to each comp's detail page:

```
LAND SALES
  Comps
    Land #1 - 16580 SW Wind Ave
    Land #2 - 321 N Moss Ave
    Land #3 - 141 Lone Star Dr
  Map
```

### 2. Comp Detail Page -- Complete Redesign

**Problem:** The current comp detail page shows "No parsed data yet" with a "Parse Files" button. There is no indication of what comp the user is on, no breadcrumb, and no useful content even after parsing.

**Feature requests:**

- **Page header** should clearly identify the comp: `LAND COMP #1 -- 16580 SW Wind Ave, Odessa, TX 79766`
- **Back navigation** link: "Back to Land Comps"
- **Top banner** showing the comp's map view (from the comp's individual location map or a static image from Drive), with an "Edit Map" button linking to `[type]/comps/[compId]/location-map`
- **Form fields** for the comp data, organized in a two-column layout matching the spreadsheet structure. Fields should be:
  - Editable inline
  - Grouped by section (Property Information, Sale Information, Utilities, Key Indicators, Income Analysis, Comments)
  - Populated from `comp_parsed_data.raw_data` when available
  - Saveable back to `comp_parsed_data.raw_data` via debounced updates
- **Document processing panel** (right-side drawer) showing files in this comp's Drive folder with processing status, ability to select files to parse/reparse
- **Parse flow** should be integrated: if the comp has a `folderId`, show the files in that folder and let the user select which to process. This replaces the old standalone parser page.

### 3. Comp UI Template Page

**Problem:** Only Sales has a UI page (`sales/ui/page.tsx`) and it uses hardcoded mock data. Land and Rentals have no UI template pages at all.

**Feature requests for all three types:**

Each comp type needs a UI template page that renders a formatted, print-ready view of a single comp. This is the view that gets pasted into the Google Doc report.

**Common structure:**
- User selects which comp to view (dropdown or URL parameter)
- Template renders the comp data from `comp_parsed_data.raw_data` using a configurable template
- Template defines which fields appear, their labels, and their layout (left column, right column, full width)
- A "Copy" button to copy the rendered HTML for pasting into Google Docs

**Template configuration:**
- Each template has rows of `{ label, fieldKey, include }` where:
  - `label` is what displays on the left (e.g., "Address", "Sale Price / SF")
  - `fieldKey` maps to a key in the comp's `raw_data` (populated from a dropdown of available field names)
  - `include` is a checkbox toggling whether this row appears
- Users should be able to reorder rows, add new rows, and remove rows
- Template definitions should be stored per-project (or use a default that can be overridden)

---

## Land Sales -- Specific Items

### Land Comp UI Template

- Base template defined in `docs/examples/report-data-spreasheet--html/ui-templates.html` at range A68:G98
- Label dropdown values come from the land comps table headers: `=CompsLand[[#HEADERS],[Address]:[Comments]]`
- Reference `docs/examples/report-data-spreasheet--html/land-sales-ui.html` for the rendered output format

### Land Comp Detail Fields

The detail page should display all fields from the `LandSaleData` interface in `docs/parser-type-defs.md`:
- Property Information: Address, APN, Legal, Land Size (AC), Land Size (SF), Corner, Highway Frontage, Zoning, etc.
- Sale Information: Sale Price, Date of Sale, Recording, Grantor, Grantee, Financing Terms, etc.
- Utilities: Electricity, Water, Sewer, Surface
- Key Indicators: Sale Price / AC (calculated), Sale Price / SF (calculated)
- Verification: MLS #, Verification Type, Verified By
- Comments

---

## Sales -- Specific Items

### Sales Comp UI Templates

Sales has **two** template variants that the user can choose between:
1. **Default template** -- `UiTemplateSalesDefaultRange` at `ui-templates!A39:L64`
2. **Income template** -- `UiTemplateSalesIncomeRange` at `ui-templates!A3:L35`

The template selector should be a dropdown at the top of the sales UI page.

### Sales UI Label Dropdown

- Label options come from: `={TRANSPOSE(CompsSales[[#HEADERS],[Address]:[Comments]]); J4:J13}`
- Reference `docs/examples/report-data-spreasheet--html/adj vals.html` for the sales UI dropdown values
- This means the dropdown includes both the column headers from the sales comps data AND some additional adjustment-related values (rows J4:J13 from adj vals)

### Sales Comp Detail Fields

All fields from the `SaleData` interface, plus income analysis fields:
- Property Information, Property Improvements, Sale Information
- Income Analysis: Rent/SF, PGI, Vacancy, EGI, Expenses, NOI
- Key Indicators: Sale Price/SF, Cap Rate, GIM
- Comments

---

## Rentals -- Specific Items

### Rentals Comp UI Template

- No template is currently defined in `ui-templates.html`, but a standard layout exists (ref `docs/examples/report-data-spreasheet--html/rentals-ui.png`)
- The layout follows the pattern from the screenshot: Property Information (left), Lease Analysis (right), Property Improvements (left), then Comments (full width)
- A default template should be created based on this layout

### Rentals UI Label Dropdown

- Values come from: `={TRANSPOSE(CompsRentals[[#HEADERS],[Address]:[Comments]]); J4:J14}`
- The data validation in the spreadsheet points to `='adj vals'!$P$4:$P$76`
- Reference `docs/examples/report-data-spreasheet--html/adj vals.html` for the rentals dropdown column

### Rentals Comp Detail Fields

All fields from the `RentalData` interface:
- Property Information, Lease Information (Lessor, Tenant, Lease Start, Term, Rent/Month, Expense Structure)
- Property Improvements: Construction, Rentable SF, Condition, HVAC, Overhead Doors, etc.
- Key Indicators: Rent/SF/Year
- Comments

---

## Comparables Map -- Multi-User Awareness

**Problem:** The comparables map is a collaborative editing surface. If two users open the same map and start moving markers, they could overwrite each other's changes.

**Feature request:** Instead of immediately entering edit mode when opening the map:
- Show the map in **read-only mode** by default
- Display an "Edit Map" button that acquires a page lock (using the existing `page_locks` table)
- If another user holds the lock, show their name and when they acquired it
- While editing, changes save in real-time via Supabase Realtime
- User explicitly clicks "Done Editing" to release the lock

---

## n8n Workflows Affected

| Workflow | Status |
|----------|--------|
| `_POST_Comps_Data` (n8n `/comps-data`) | **Still in use** by "Refresh Data" button -- should be removed or replaced |
| `_POST_Comp_Parser` | **Already replaced** by `POST /api/comps/parse` |
| `_POST_Comps_Exists` | **Still in use** -- should be removed once comps are managed in-app |
