# 009: Location Map / Comparables Map -- Read-Only Default with Edit Lock

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None
**Feedback ref:** docs/feedback/05-comp-sections.md (map section), docs/feedback/04-neighborhood-section.md

## Problem

When navigating to any map page (neighborhood map, comparables map, location map), the map immediately opens in edit mode. This means accidentally dragging a marker or drawing tool changes the saved data. With two users, one can silently overwrite the other's work.

A `MapLockGuard` component was created in the UX Overhaul plan but has not been integrated into any map pages yet.

## Expected Behavior

1. Map pages load in **read-only mode** by default (map is visible, markers and drawings are rendered, but not interactive)
2. An "Edit Map" button is visible at the top
3. Clicking "Edit Map" acquires a lock via the `page_locks` table
4. If another user holds the lock, a message shows: "Map is being edited by [user]"
5. While editing, all tools and interactions are enabled
6. "Done Editing" releases the lock and returns to read-only mode
7. Realtime subscription on `page_locks` keeps lock status live

## Affected Files

- `src/components/MapLockGuard.tsx` -- already created, needs integration
- `src/app/project/[projectId]/neighborhood-map/page.tsx` -- wrap map content with MapLockGuard
- `src/app/project/[projectId]/land-sales/comparables-map/page.tsx` -- wrap with MapLockGuard
- `src/app/project/[projectId]/sales/comparables-map/page.tsx` -- wrap with MapLockGuard
- `src/app/project/[projectId]/rentals/comparables-map/page.tsx` -- wrap with MapLockGuard
- `src/app/project/[projectId]/subject/location-map/page.tsx` -- wrap with MapLockGuard
- All `*/comps/[compId]/location-map/page.tsx` pages

## Acceptance Criteria

- [ ] All map pages load in read-only mode
- [ ] "Edit Map" button acquires a page lock
- [ ] Lock holder is shown when another user has the lock
- [ ] "Done Editing" releases the lock
- [ ] Map interactions are disabled in read-only mode
