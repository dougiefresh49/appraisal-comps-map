# Neighborhood Section -- Feedback and Feature Requests

**Priority:** Medium
**Current page:** `/project/[projectId]/neighborhood` (Map & Analysis combined)

## Summary of Issues

The neighborhood section has unnecessary sidebar nesting, a placeholder banner image, no neighborhood boundary display, and no back-navigation from the map editor.

---

## 1. Sidebar -- Remove Group Nesting

**Problem:** The sidebar has a "Neighborhood" group with a single item "Map & Analysis". A collapsible group with one item is unnecessary UI overhead.

**Fix:** Replace the Neighborhood group with a single top-level sidebar item labeled "Neighborhood" that links directly to `/project/[projectId]/neighborhood`. Remove it from the `navSections` array and render it as a standalone link like "Dashboard" and "Cover Page".

---

## 2. Map Banner -- Use Real Image

**Problem:** The neighborhood page shows a placeholder emoji and "Edit the map to update this preview" text. It should show the actual neighborhood map.

**Feature Request:** The banner should display one of:

- **Option A (preferred):** The screenshot saved in Google Drive at `reports/maps/neighborhood.png`. Use the `reportMapsFolderId` from the project's folder structure to find and render it via a Drive thumbnail URL.
- **Option B:** A read-only rendering of the Google Maps map with the drawn polygons/polylines from the neighborhood map data in Supabase. This would use the same map components but without edit controls.

**Implementation for Option A:**
- On page load, check if `reports/maps/neighborhood.png` exists in Drive
- If yes, render it as the banner image (use Drive thumbnail API: `https://drive.google.com/thumbnail?id={fileId}&sz=w1200`)
- If no, show the current placeholder with a prompt to create the map first
- The "Edit Map" button already exists and links correctly

---

## 3. Neighborhood Boundaries Display

**Problem:** There is no way to view the neighborhood boundaries (North, South, East, West boundary descriptions) on the neighborhood page. These boundaries are entered as labels in the neighborhood map editor's label fields and are used in the report content.

**Feature Request:** Add a section between the map banner and the analysis writeup that displays the four boundary fields:

```
+--------------------------------------------------+
|  NEIGHBORHOOD BOUNDARIES                          |
|  North:  Andrews Hwy                              |
|  South:  I-20                                     |
|  East:   JBS Pkwy                                 |
|  West:   Faudree Rd                               |
+--------------------------------------------------+
```

- Fields should be editable inline
- Values should be stored in `subject_data.core` (add `neighborhoodBoundaries` to the core JSONB: `{ north: string, south: string, east: string, west: string }`)
- These same values should be used in the Labels section of the neighborhood map editor, so they stay in sync
- When generating the neighborhood analysis content, these boundaries should be included in the prompt context

---

## 4. Back Navigation from Map Editor

**Problem:** When the user clicks "Edit Map" and goes to the neighborhood map editor (`/project/[projectId]/neighborhood-map`), there is no UI element to navigate back to the neighborhood overview page. The only way back is the sidebar (if it is visible) or the browser back button.

**Fix:** Add a "Back to Neighborhood" link or button at the top of the neighborhood map page, similar to how the comp detail page has "Back to Comps". This should be a simple `Link` component pointing to `/project/[projectId]/neighborhood`.

---

## Proposed Page Layout (Updated)

```
+----------------------------------------------+
|  [Neighborhood Map Image]        [Edit Map]   |
|  (from Drive reports/maps/neighborhood.png)    |
+----------------------------------------------+
|  NEIGHBORHOOD BOUNDARIES                       |
|  North: [editable]   South: [editable]         |
|  East: [editable]    West: [editable]          |
+----------------------------------------------+
|  Neighborhood Analysis           [Doc Panel]   |
|  Generate, view, and edit...                   |
|  [Generated content / markdown editor]         |
|  [Generate Content] [Edit] [Regenerate] [Copy] |
+----------------------------------------------+
```

The `[Doc Panel]` button opens the reusable right-side document processing panel (same component described in the Subject Overview section).
