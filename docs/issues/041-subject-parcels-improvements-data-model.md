# 041 — Clean up subject parcels/improvements data model

**Status:** Open  
**Priority:** Medium  
**Complexity:** Medium  

## Background

`subject_data` has three places where parcel/improvement info can live:

1. **`subject_data.core`** — flat JSONB with keys like `APN`, `Building Size (SF)`, `Office Area (SF)`, `Land Size (AC)`, `Year Built`, `Construction`, etc. This is the source of truth today because the Subject Overview form reads/writes exclusively to `core`.
2. **`subject_data.parcels`** (`ParcelData[]`) — normalized parcel array, currently blank for all past projects.
3. **`subject_data.improvements`** (`ParcelImprovement[]`) — normalized improvement array, also blank for all past projects.

The Rebuild-from-Documents flow can now populate `parcels` and `improvements` via `proposed_parcels` / `proposed_improvements`, but when those arrays are empty the Subject Overview tables were blank — even though `core` had all the data already entered via the form.

## Current workaround (implemented)

`SubjectDataEditor.tsx` derives a synthetic parcel row and improvement row from `core` when the corresponding DB arrays are empty. This ensures the tables always reflect the form data. The derived rows use:

| core key | ParcelData field |
|----------|-----------------|
| `APN` | `APN` |
| `Address` | `Location` |
| `Legal` | `Legal` |
| `Land Size (AC)` | `Size (AC)` |
| `Land Size (SF)` | `Size (SF)` |
| `Building Size (SF)` | `Building Size (SF)` |
| `Office Area (SF)` | `Office Area (SF)` |
| `Warehouse Area (SF)` | `Warehouse Area (SF)` |
| `Parking (SF)` | `Parking (SF)` |

And for improvements:

| core key | ParcelImprovement field |
|----------|------------------------|
| `APN` | `APN` |
| `Building Size (SF)` | `Gross Building Area (SF)` |
| `Office Area (SF)` | `Office Area (SF)` |
| `Warehouse Area (SF)` | `Warehouse Area (SF)` |
| `Parking (SF)` | `Parking (SF)` |
| `Year Built` | `Year Built` |
| `Construction` | `Construction` |

## What should happen long-term

Pick **one** canonical location for parcel/improvement data and keep the other in sync or remove it:

### Option A: Keep `core` as source of truth, remove `parcels`/`improvements` columns
- Simplest. The form already edits `core`, and the adjustment grid reads from `core`.
- Remove `parcels`, `improvements`, `proposed_parcels`, `proposed_improvements` columns.
- Remove the `ParcelDataTable` / `ParcelImprovementsTable` from Subject Overview (or make them read-only projections from `core`).
- **Downside:** Multi-parcel subjects cannot be modeled (one row per parcel).

### Option B: Promote `parcels`/`improvements` as source of truth, derive `core` summary fields
- Better for multi-parcel subjects (subjects with 2+ APNs).
- The form edits parcels directly; `core` summary fields (`Building Size (SF)`, `Land Size (SF)`, etc.) are computed aggregates.
- Requires significant refactor of the form, hooks, and calculated fields.

### Option C: Keep both, keep `core` primary but auto-populate `parcels`/`improvements` from `core` on save
- Minimal disruption — `core` stays primary, `parcels`/`improvements` are materialized views.
- A `useEffect` or server-side trigger keeps them in sync whenever `core` is saved.
- Multi-parcel subjects still need direct `parcels` editing.

## Decision needed

Choose A, B, or C (or a hybrid) before implementing. The current workaround (derive from `core` in the UI) is good enough for now.

## Key reference files

- `src/components/SubjectDataEditor.tsx` — form + derived display logic
- `src/components/ParcelDataTable.tsx` — parcel table component
- `src/components/ParcelImprovementsTable.tsx` — improvement table component
- `src/hooks/useSubjectData.ts` — data hook with `clearProposedData`
- `src/server/subject-data/merge.ts` — Rebuild merge functions
- `src/types/comp-data.ts` — `ParcelData`, `ParcelImprovement`, `SubjectDataRow`
- `src/lib/calculated-fields.ts` — adjustment grid reads from `core`
