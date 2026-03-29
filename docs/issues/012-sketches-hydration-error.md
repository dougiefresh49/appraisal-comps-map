# 012: Sketches Page -- Hydration Error (Button Inside Button)

**Priority:** High
**Complexity:** Low
**Dependencies:** None
**Feedback ref:** Console error screenshot

## Problem

The building sketches page at `/project/[projectId]/subject/sketches` throws a React hydration error:

> In HTML, `<button>` cannot be a descendant of `<button>`. This will cause a hydration error.

The error is at `src/app/project/[projectId]/subject/sketches/page.tsx` line 165 inside `SubjectSketchesPage`. This is caused by a `<button>` element being nested inside another `<button>` (likely the lightbox close button inside a clickable image container that is also a button).

## Fix

Change the outer element from `<button>` to `<div>` with `onClick` and `role="button"` + `tabIndex={0}`, or restructure the lightbox overlay so the close button is not a descendant of another button element.

## Affected Files

- `src/app/project/[projectId]/subject/sketches/page.tsx` -- fix the nesting around line 165

## Acceptance Criteria

- [ ] No hydration error in console
- [ ] Lightbox opens and closes correctly
- [ ] Image click and close button both work
