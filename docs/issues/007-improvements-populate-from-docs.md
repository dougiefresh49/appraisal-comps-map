# 007: Improvements Page -- Values Not Populated from Parsed Documents

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None
**Feedback ref:** User testing feedback

## Problem

The improvement analysis rows have labels and include checkboxes but all values are empty ("--"). The values should be pre-populated from the subject's parsed documents (CAD data, deed records, engagement doc) and/or from the `subject_data.core` fields that already contain building information.

## Expected Behavior

When the improvement analysis page loads:
1. Check `subject_data.core` for matching fields (e.g., "Year Built", "Condition", "Construction", "Building Size (SF)", "Land/Bld Ratio")
2. Check `project_documents` with type `cad` for structured data that might contain improvement details
3. Auto-populate matching rows in the improvement analysis with found values
4. User can override any auto-populated value

Mapping between improvement analysis labels and data sources:
- "Property Type" --> `subject_data.core.propertyType` or project `property_type`
- "Gross Building Area (GBA)" --> `subject_data.core["Building Size (SF)"]`
- "Year Built" --> `subject_data.core["Year Built"]`
- "Condition" --> `subject_data.core.Condition`
- "Construction Class" --> `subject_data.core.Construction`
- "Land/Bld Ratio" --> `subject_data.core["Land / Bld Ratio"]`
- Others from CAD/deed structured data when available

## Affected Files

- `src/components/ImprovementAnalysisEditor.tsx` -- on initial load (when rows have empty values), attempt to populate from `subject_data.core` and `project_documents` structured data
- May need a utility function to map improvement labels to data source keys

## Acceptance Criteria

- [ ] Rows with matching subject data are auto-populated on first load
- [ ] Auto-populated values can be manually overridden
- [ ] A "Populate from Subject Data" button allows re-syncing values
- [ ] Empty rows remain empty (no forced values)
