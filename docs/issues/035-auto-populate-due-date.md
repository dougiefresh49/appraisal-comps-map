# 035: Auto-Populate Due Date from Effective Date in Onboarding

**Priority:** Low
**Complexity:** Low
**Dependencies:** None

## Problem

During the onboarding flow (step 3 -- Engagement Document), the effective date is populated from the engagement letter but the due date remains empty. A sensible default would be 3 weeks (21 days) after the effective date.

## Expected Behavior

When the effective date field is populated (either from engagement parsing or manual entry), automatically set the due date to 21 days later if the due date is currently empty. The user can still override it manually.

## Affected Files

- `src/app/projects/new/page.tsx` -- add an effect or handler that computes due date when effective date changes and due date is empty

## Acceptance Criteria

- [ ] Due date auto-fills to effective date + 21 days when effective date is set and due date is empty
- [ ] Manual edits to due date are not overwritten
- [ ] Works for both engagement-parsed dates and manually entered dates
