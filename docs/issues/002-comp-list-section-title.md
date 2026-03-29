# 002: Comp List Page -- Show Section Title Instead of Project Name

**Priority:** High
**Complexity:** Low
**Dependencies:** None
**Feedback ref:** docs/feedback/05-comp-sections.md

## Problem

The comparables list page header displays the project name (e.g., "331 Angel Trail Odessa 3-17-2025") as the main title. This is redundant since the project name is already shown in the sidebar. The title should describe the page content (e.g., "Sales Comparables").

## Expected Behavior

The `<h2>` header should display the comp type name:
- "Land Comparables" for Land
- "Sales Comparables" for Sales
- "Rental Comparables" for Rentals

The subtitle "Manage {type} comparables." can remain.

## Affected Files

- `src/components/ComparablesPageContent.tsx` -- change the `<h2>` from `{projectName}` to `{type} Comparables`

## Acceptance Criteria

- [ ] The heading shows "{Type} Comparables" instead of the project name/UUID
- [ ] The subtitle "Manage {type} comparables." remains
