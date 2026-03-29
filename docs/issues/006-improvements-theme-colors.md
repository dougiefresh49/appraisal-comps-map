# 006: Improvements Page -- Light Mode Theme + Harsh Neon Colors

**Priority:** Medium
**Complexity:** Low
**Dependencies:** None
**Feedback ref:** User testing feedback

## Problem

Two visual issues with the Improvement Analysis page:

1. **Light mode not applied**: The page doesn't properly support light mode theming. When the system is in dark mode, the colors work but are too harsh.
2. **Neon category panel colors are distracting**: The fully colored panels for each category (blue, purple, amber, green, teal, orange, lime backgrounds) are too intense and make the page hard to read. The backgrounds should be much more subtle.

## Expected Behavior

- Category panels should use very subtle background tints instead of strong colored backgrounds
- In dark mode: use `border-{color}-800/40` borders with nearly transparent backgrounds like `bg-{color}-950/10`
- In light mode: use `border-{color}-200` with `bg-{color}-50/50`
- The category header text can retain stronger color for identification
- Row backgrounds should be neutral (not colored)

## Affected Files

- `src/components/ImprovementAnalysisEditor.tsx` -- adjust `CATEGORY_PANEL` colors to be more subtle, ensure light/dark mode support

## Acceptance Criteria

- [ ] Category panels use subtle, non-distracting background colors
- [ ] Page is readable in both light and dark modes
- [ ] Category identity is maintained via border color and header text color (not heavy background fills)
