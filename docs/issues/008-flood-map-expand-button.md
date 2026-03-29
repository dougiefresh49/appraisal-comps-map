# 008: Flood Map Banner -- Swap Edit Map to Expand

**Priority:** Low
**Complexity:** Low
**Dependencies:** None
**Feedback ref:** User testing feedback

## Problem

The flood map page uses the `MapBanner` component which has an "Edit Map" button. For the flood map, there is no map to edit -- the image is a static flood map PNG from Google Drive. The button should be "Expand" instead, opening the image in a larger view or lightbox.

## Expected Behavior

- The flood map banner button should say "Expand" (or show an expand icon) instead of "Edit Map"
- Clicking it opens the image in a full-screen lightbox or modal
- The `MapBanner` component should support an `actionLabel` and `actionType` prop to differentiate between "edit" (navigates to editor) and "expand" (opens lightbox)

## Affected Files

- `src/components/MapBanner.tsx` -- add optional `actionLabel` prop and `onActionClick` callback as alternative to `editHref`
- `src/app/project/[projectId]/subject/flood-map/page.tsx` -- pass expand action instead of edit href

## Acceptance Criteria

- [ ] Flood map banner shows "Expand" button instead of "Edit Map"
- [ ] Clicking Expand opens the image in a larger view
- [ ] Other MapBanner usages (neighborhood, comps) still show "Edit Map" with navigation
