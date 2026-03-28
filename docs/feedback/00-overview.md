# Webapp Feedback and Feature Requests -- Overview

This folder contains documented feedback, bugs, and feature requests for the appraisal comps maps webapp. Each file focuses on a specific area of the application.

## Documents

| File | Area | Priority |
|------|------|----------|
| [01-db-bugs.md](01-db-bugs.md) | Database / RLS fixes | Critical |
| [02-onboarding-flow.md](02-onboarding-flow.md) | New project onboarding | High |
| [03-subject-section.md](03-subject-section.md) | Subject section (overview, improvements, photos, flood map, sketches, cost report) | High |
| [04-neighborhood-section.md](04-neighborhood-section.md) | Neighborhood map and analysis | Medium |
| [05-comp-sections.md](05-comp-sections.md) | Land Sales, Sales, and Rentals (comps, detail views, UI templates, maps) | High |
| [06-analysis-section.md](06-analysis-section.md) | Analysis pages (zoning, ownership, site summary, HBU) | Medium |
| [07-documents-section.md](07-documents-section.md) | Project documents management | Medium |

## Context

These feedback items were identified after the initial implementation of the Comp Data Management plan (Groups A-F). The implementation produced the correct data layer and routing structure, but the UI/UX needs significant refinement to match the actual appraisal workflow. Key themes:

1. **The old n8n-based project creation flow is still in use** -- the "new project" flow calls the old `_POST_Get_Project_Page_Data` n8n workflow which returns minimal data in the old format. This needs to become a proper onboarding flow.
2. **Subject data is too thin** -- the subject section needs flood map display, building sketches, cost report viewing, and document processing awareness.
3. **Comp pages are still using old data/UI patterns** -- the comp list pages still look like the original card layout; comp detail pages are essentially empty; comp UI templates are not wired up.
4. **Analysis pages should be under Subject** -- zoning, ownership, site summary, and HBU are all subject-related and should be grouped there, not in a separate Analysis section.
5. **Document management needs a Drive folder browser** -- instead of requiring file IDs, users should be able to browse Drive folders contextually.

## n8n Workflows Affected

| Workflow | File | Status After Changes |
|----------|------|---------------------|
| `_POST_Get_Project_Page_Data` | `iVTYnNvW4O6w83qx` | **To be replaced** by in-app onboarding flow |
| `_POST_Subject_Photos_Analyze` | (existing) | **Still in use** -- photos analysis still calls n8n |
| `_POST_Comp_Parser` | `4VpYtyIyln5GJWck` | **Already replaced** by `POST /api/comps/parse` |
