# 005: Sketches Page -- 429 Rate Limiting on Thumbnail Loads

**Priority:** High
**Complexity:** Low
**Dependencies:** None
**Feedback ref:** User testing feedback

## Problem

The building sketches page at `/project/[projectId]/subject/sketches` hits a 429 Too Many Requests error from the Google Drive thumbnail API when loading multiple images simultaneously. Each image requests `https://drive.google.com/thumbnail?id={fileId}&sz=w600` and when there are many sketches, the requests exceed Drive's rate limit.

## Root Cause

All thumbnail images are rendered simultaneously in the grid, triggering parallel HTTP requests to the Drive thumbnail API. Drive rate limits per-user and returns 429 when too many requests arrive in a short window.

## Fix Options

1. **Lazy loading with IntersectionObserver**: Only load thumbnails when they scroll into view. This spreads requests over time.
2. **Staggered loading**: Load thumbnails in batches of 3-4 with a small delay between batches.
3. **Use the Drive API to download thumbnails server-side**: Create a proxy endpoint that fetches and caches thumbnails, avoiding client-side rate limits.
4. **Use `loading="lazy"` on img tags**: Simplest fix -- the browser natively defers off-screen images.

**Recommended approach**: Option 4 (`loading="lazy"`) as immediate fix, combined with option 1 for a better UX.

## Affected Files

- `src/app/project/[projectId]/subject/sketches/page.tsx` -- add `loading="lazy"` to all `<img>` tags, optionally implement staggered loading

## Acceptance Criteria

- [ ] Sketches page loads without 429 errors
- [ ] Images load progressively as user scrolls
- [ ] Page remains usable with 10+ sketch images
