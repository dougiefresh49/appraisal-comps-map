# Analysis Section -- Feedback and Feature Requests

**Priority:** Medium
**Current pages:** `analysis/zoning`, `analysis/ownership`, `analysis/subject-site-summary`, `analysis/highest-best-use`

## Summary of Issues

The analysis pages should not have their own sidebar section -- they belong under Subject. The pages are visually bare, lacking context about what documents were used for generation and providing no way to add more context for regeneration.

---

## 1. Move Under Subject Sidebar

**Problem:** The sidebar has a dedicated "Analysis" group for these four pages. Since they are all about the subject property, they should be nested under the "Subject" group.

**Action:** See `docs/feedback/03-subject-section.md` section 2 for the proposed sidebar structure. The routes can stay at `/project/[projectId]/analysis/*` (to avoid breaking existing links) or be moved to `/project/[projectId]/subject/*` for consistency.

---

## 2. Document Context Panel

**Problem:** Each analysis page (e.g., Ownership) shows generated content with Edit/Regenerate/Copy buttons, but there is no way for the user to:
- See which documents were used as context for the generation
- Verify the sources (e.g., "this ownership section was generated using deed record #2013-00012840")
- Add additional documents for richer context before regenerating
- Remove incorrect documents from the context

The current Regenerate dialog allows adding extra text context, but if the user has a corrected deed record or additional document, they cannot easily include it.

**Feature Request:** Add a document context panel button to each analysis page. When clicked, it opens the reusable right-side drawer showing:

### Panel Content

**Section: Context Documents**
- List of `project_documents` that are relevant to this section (filtered by the `SECTION_DOCUMENT_MAP` from `prompt-builder.ts`)
- Each document shows:
  - Document name/type
  - Processing status (green/yellow/red indicator)
  - A checkbox to include/exclude it from the generation context
  - "View Extracted Text" expandable section showing what was extracted
- "Add Document" button to upload or select a new document from Drive

**Section: Photo Context**
- For sections that use photo context (like Subject Site Summary), show the included photos and their descriptions
- Toggle to include/exclude photo context

**Section: Related Sections**
- For Highest and Best Use (which depends on Zoning, Ownership, and Subject Site Summary), show the content of those prerequisite sections
- Indicate if any prerequisite sections have been updated since the last generation of HBU

### Document-to-Section Mapping

The existing mapping in `src/lib/prompt-builder.ts` (`SECTION_DOCUMENT_MAP`) determines which document types are relevant:

```
neighborhood → neighborhood_map
zoning → zoning_map
subject-site-summary → flood_map, cad
ownership → deed
highest-best-use → (uses other sections, not documents directly)
```

This mapping should drive what appears in the context panel for each section.

---

## 3. Visual Design Improvement

**Problem:** The analysis pages are visually sparse -- just a title, description, and the markdown content area. They lack visual hierarchy and context.

**Feature Request:**

- Add a subtle header area with the project name and section title
- Show a "last generated" timestamp if content exists
- Show which model/method was used for generation
- If no content exists, show a more helpful empty state explaining what this section is about and what documents are needed to generate it (e.g., "Upload a deed record in the Documents section to generate ownership analysis")
- Consider adding the map banner pattern for sections that have associated maps (e.g., Zoning could show the zoning map from `reports/maps/zoning.png`)

---

## Page-Specific Notes

### Zoning
- Could show the zoning map image from `reports/maps/zoning.png` as a banner
- Context documents: zoning map image
- Data fields from subject: Zoning, Zoning Description, Zoning Area (from `subject_data.core`)

### Ownership
- Context documents: deed record
- Should display key ownership facts extracted from the deed as structured data above the narrative (grantor, grantee, recording number, date, consideration, legal description)

### Subject Site Summary
- Context documents: flood map, CAD
- Uses photo context extensively
- Should display key facts: land size, building size, year built, condition, utilities summary

### Highest and Best Use
- No direct document context, but depends on Zoning, Ownership, and Subject Site Summary sections being generated first
- The panel should show the status of prerequisite sections and warn if they are empty or stale
