# Open Issues Index

Tracked issues for the Appraisal Comps Maps webapp. Each issue file is self-contained with description, affected files, acceptance criteria, complexity, priority, and dependencies.

## Quick Reference

| ID | Title | Priority | Complexity | Dependencies |
|----|-------|----------|------------|--------------|
| 001 | Comp add flow: Drive folder picker instead of manual entry | High | Medium | None |
| 002 | Comp list page: show section title instead of project name | High | Low | None |
| 003 | Comp detail page: empty state shows dashes instead of comp data | High | Medium | 001 |
| 004 | Document side-panel: scope to current section, inline add | High | Medium | None |
| 005 | Sketches page: 429 rate-limiting on thumbnail loads | High | Low | None |
| 006 | Improvements page: light mode theme + neon card colors too harsh | Medium | Low | None |
| 007 | Improvements page: values not populated from parsed documents | Medium | Medium | None |
| 008 | Flood map banner: swap Edit Map to Expand for full image view | Low | Low | None |
| 009 | Location map / comparables map: read-only default with edit lock | Medium | Medium | None |
| 010 | Documents page: add tags/categories for filtering by section | Medium | Medium | None |
| 011 | Document side-panel: add View (eyeball) button to open in new tab | Low | Low | None |
| 012 | Sketches page: hydration error (button inside button) | High | Low | None |
| 013 | Update product docs to reflect current state | Low | Low | None |
| 014 | Update feedback docs to mark completed items | Low | Low | None |

## Parallelization Guide

**Can run in parallel (no dependencies):**
- 001, 002, 004, 005, 006, 007, 008, 009, 010, 011, 012

**Sequential (has dependencies):**
- 003 depends on 001 (comp add flow creates the comp first)

**Standalone cleanup (run anytime):**
- 013, 014
