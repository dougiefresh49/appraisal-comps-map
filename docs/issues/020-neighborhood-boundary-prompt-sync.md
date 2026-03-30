# 020: Neighborhood Boundary Prompt Key Mismatch

**Priority:** Medium
**Complexity:** Low
**Dependencies:** None
**Origin:** Remaining item from feedback/04-neighborhood-section.md

## Problem

The neighborhood page and subject overview store boundary values in `subject_data.core.neighborhoodBoundaries` (an object with `north`, `south`, `east`, `west` keys). However, `src/lib/prompt-builder.ts` reads `subject.neighborhoodBounds` (a string) when building the neighborhood analysis prompt. This means the boundary data entered in the UI does not feed into AI-generated neighborhood content.

## Expected Behavior

The prompt builder should read the `neighborhoodBoundaries` object from `subject_data.core` and format it as text for the prompt, e.g.:
```
Neighborhood Boundaries: North: Andrews Hwy, South: I-20, East: JBS Pkwy, West: Faudree Rd
```

## Affected Files

- `src/lib/prompt-builder.ts` -- update the neighborhood case to read `core.neighborhoodBoundaries` and format as a string

## Acceptance Criteria

- [ ] Neighborhood boundaries entered in the UI appear in the generation prompt
- [ ] Generated neighborhood content references the correct boundary streets
