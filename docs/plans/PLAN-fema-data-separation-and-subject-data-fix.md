# Plan: Move FEMA Data to Dedicated JSONB Column & Fix Subject Data Persistence

## Problem Statement

After onboarding, the subject details (APN, Legal Description, Land Size, Year Built, etc. extracted from the CAD document) are **not** populating the Subject Overview form fields, nor appearing in the `subject_data` table's `core` JSONB column. Only the FEMA flood-map fields persist.

**Example**: `subject_data` row `ea704ff5-6c51-4ed8-9c3d-6d7f68275301` shows this behavior — FEMA data is present in `core`, but CAD-sourced fields are missing.

PR #10 (`fix: atomic subject_data merge to prevent concurrent overwrites`) introduced an atomic `merge_subject_core` Postgres function and migration `014_atomic_subject_core_merge.sql`, but the issue persists.

## Root Cause Analysis

There are **multiple contributing factors**:

### 1. The `handleFinalize` Initial Seed Overwrites Subsequent Merges

In `src/app/projects/new/page.tsx`, `handleFinalize()` performs a **plain upsert** of `subject_data` with `core` containing Address + FEMA fields:

```typescript
await supabase.from("subject_data").upsert({
  project_id: projectId,
  core: subjectCore,  // { Address, City, State, Zip, FemaMapNum, FemaZone, FemaMapDate, FemaIsHazardZone }
  taxes: [], tax_entities: [], parcels: [], improvements: [],
}, { onConflict: "project_id" });
```

This **replaces the entire `core` column** each time. If any document processor (CAD, deed) has already started and merged data into `core` before this upsert runs, those fields get blown away. Conversely, if the upsert runs first and sets `core` to only Address+FEMA, the subsequent `merge_subject_core` RPC call is supposed to fill in the blanks — but there's a timing/ordering issue.

### 2. Fire-and-Forget Processing + Navigation Away

`addDocument()` calls `void processDocument(...)` (fire-and-forget). The user is redirected to the project page before Gemini finishes extracting data from CAD/deed files. If migration `014` is not applied, the fallback read-modify-write in `merge.ts` races with the `handleFinalize` upsert.

### 3. FEMA Data Mixed Into `core` Creates Collision Surface

Currently FEMA fields (`FemaMapNum`, `FemaZone`, `FemaIsHazardZone`, `FemaMapDate`) live alongside subject property fields (`APN`, `Legal`, `Land Size`, etc.) in the same `core` JSONB column. This means:

- The initial upsert must merge both concerns into one object
- The `merge_subject_core` function's "only write if null/empty" guard means the initial seed's FEMA values block the flood_map processor, but the initial seed also locks in Address/City/State/Zip and blocks any enrichment from CAD
- Separate domain concerns (property identification vs. flood data) fighting over the same column increases complexity and bug surface

### 4. Migration Possibly Not Applied

The PR #10 fix relies on migration `014_atomic_subject_core_merge.sql` being applied. The `merge.ts` code silently falls back to the racy read-modify-write pattern if the RPC fails. Without server logs, it's easy to miss this.

## Proposed Solution: Move FEMA Data to Dedicated `fema` JSONB Column

### Architecture Changes

**Add a new `fema` JSONB column to `subject_data`** to cleanly separate flood-map data from subject property data. This eliminates the cross-concern collision in `core` and simplifies both the initial seed logic and the merge function.

### New `subject_data` Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` (PK) | Auto-generated |
| `project_id` | `uuid` (FK → projects, UNIQUE) | One row per project |
| `core` | `jsonb` | Property identification: APN, Legal, Address, City, State, Zip, Land Size, Year Built, Zoning, Utilities, etc. |
| **`fema`** | **`jsonb`** | **FEMA flood data: FemaMapNum, FemaZone, FemaIsHazardZone, FemaMapDate** |
| `taxes` | `jsonb` | Tax entity rows |
| `tax_entities` | `jsonb` | Tax entity definitions |
| `parcels` | `jsonb` | Parcel data |
| `improvements` | `jsonb` | Improvement data |
| `improvement_analysis` | `jsonb` | Improvement analysis rows |
| `updated_at` | `timestamptz` | Last modification |

### FEMA Data Shape (TypeScript)

```typescript
export interface FemaData {
  FemaMapNum?: string | null;
  FemaZone?: string | null;
  FemaIsHazardZone?: boolean | null;
  FemaMapDate?: string | null;
}
```

## Implementation Plan

### Phase 1: Database Migration

**File**: `supabase/migrations/015_fema_column.sql`

```sql
-- Add dedicated fema JSONB column to subject_data
ALTER TABLE subject_data
  ADD COLUMN IF NOT EXISTS fema jsonb NOT NULL DEFAULT '{}';

-- Migrate existing FEMA data from core → fema for all rows that have it
UPDATE subject_data
SET
  fema = jsonb_build_object(
    'FemaMapNum',       COALESCE(core->'FemaMapNum', 'null'::jsonb),
    'FemaZone',         COALESCE(core->'FemaZone', 'null'::jsonb),
    'FemaIsHazardZone', COALESCE(core->'FemaIsHazardZone', 'null'::jsonb),
    'FemaMapDate',      COALESCE(core->'FemaMapDate', 'null'::jsonb)
  ),
  core = core - 'FemaMapNum' - 'FemaZone' - 'FemaIsHazardZone' - 'FemaMapDate'
WHERE
  core ? 'FemaMapNum'
  OR core ? 'FemaZone'
  OR core ? 'FemaIsHazardZone'
  OR core ? 'FemaMapDate';
```

**What this does**:
1. Adds a `fema` column with an empty-object default
2. Copies existing FEMA keys from `core` into the new `fema` column
3. Removes FEMA keys from `core` to avoid stale duplicates

### Phase 2: Update TypeScript Types

**File**: `src/types/comp-data.ts`

Add the `FemaData` interface and update `SubjectDataRow`:

```typescript
export interface FemaData {
  FemaMapNum?: string | null;
  FemaZone?: string | null;
  FemaIsHazardZone?: boolean | null;
  FemaMapDate?: string | null;
}

export interface SubjectDataRow {
  id: string;
  project_id: string;
  core: SubjectData | Record<string, unknown>;
  fema: FemaData;                          // ← NEW
  taxes: SubjectTax[];
  tax_entities: TaxEntity[];
  parcels: ParcelData[];
  improvements: ParcelImprovement[];
  improvement_analysis?: ImprovementAnalysisRow[] | null;
  updated_at: string;
}
```

### Phase 3: Update Onboarding – `handleFinalize` in `src/app/projects/new/page.tsx`

**Before** (current):
```typescript
const subjectCore: Record<string, unknown> = { Address: address };
// ... address parts ...
if (floodData) {
  if (floodData.fema_map_number) subjectCore.FemaMapNum = floodData.fema_map_number;
  // ... etc
}

await supabase.from("subject_data").upsert({
  project_id: projectId,
  core: subjectCore,
  taxes: [], tax_entities: [], parcels: [], improvements: [],
}, { onConflict: "project_id" });
```

**After**:
```typescript
const subjectCore: Record<string, unknown> = { Address: address };
// ... address parts (City, State, Zip) ...
// NO FEMA DATA IN core

const femaPayload: Record<string, unknown> = {};
if (floodData) {
  if (floodData.fema_map_number) femaPayload.FemaMapNum = floodData.fema_map_number;
  if (floodData.flood_zone) femaPayload.FemaZone = floodData.flood_zone;
  if (floodData.map_effective_date) femaPayload.FemaMapDate = floodData.map_effective_date;
  if (floodData.in_special_flood_hazard_area === "true") femaPayload.FemaIsHazardZone = true;
  else if (floodData.in_special_flood_hazard_area === "false") femaPayload.FemaIsHazardZone = false;
}

await supabase.from("subject_data").upsert({
  project_id: projectId,
  core: subjectCore,
  fema: femaPayload,
  taxes: [], tax_entities: [], parcels: [], improvements: [],
}, { onConflict: "project_id" });
```

### Phase 4: Update Merge Logic – `src/server/subject-data/merge.ts`

Remove the `flood_map` entry from `MERGE_MAP` and instead have flood_map documents write directly to the `fema` column.

**Updated MERGE_MAP**:
```typescript
const MERGE_MAP: Record<string, (data: StructuredData) => CorePatch> = {
  deed: (d) => ({
    Legal: str(d.legal_description),
    Address: str(d.property_address),
    instrumentNumber: str(d.instrument_number),
  }),
  cad: (d) => ({
    APN: str(d.property_id),
    Legal: str(d.legal_description),
    "Land Size (AC)": num(d.lot_area_acres),
    "Land Size (SF)": num(d.lot_area_sqft),
    "Year Built": num(d.year_built),
  }),
  engagement: (d) => ({
    Address: str(d.property_address),
  }),
  // flood_map REMOVED — handled separately via mergeFemaData()
};
```

**Add new `mergeFemaData` function**:
```typescript
export async function mergeFemaData(
  projectId: string,
  structuredData: StructuredData,
): Promise<void> {
  if (!projectId || !structuredData) return;

  const fields = (
    typeof structuredData.structured_data === "object" && structuredData.structured_data !== null
      ? structuredData.structured_data
      : structuredData
  ) as StructuredData;

  const femaPayload: Record<string, unknown> = {};
  const mapNum = str(fields.fema_map_number);
  const zone = str(fields.flood_zone);
  const mapDate = str(fields.map_effective_date);
  const hazard = fields.in_special_flood_hazard_area;

  if (mapNum) femaPayload.FemaMapNum = mapNum;
  if (zone) femaPayload.FemaZone = zone;
  if (mapDate) femaPayload.FemaMapDate = mapDate;
  if (hazard === true || hazard === "true") femaPayload.FemaIsHazardZone = true;
  else if (hazard === false || hazard === "false") femaPayload.FemaIsHazardZone = false;

  if (Object.keys(femaPayload).length === 0) return;

  const supabase = await createClient();

  // Read current fema, merge only empty fields, write back
  const { data: existing } = await supabase
    .from("subject_data")
    .select("fema")
    .eq("project_id", projectId)
    .maybeSingle();

  const currentFema = (existing?.fema ?? {}) as Record<string, unknown>;
  const merged = { ...currentFema };
  for (const [key, value] of Object.entries(femaPayload)) {
    const cur = merged[key];
    if (cur == null || cur === "" || cur === 0) {
      merged[key] = value;
    }
  }

  await supabase
    .from("subject_data")
    .upsert(
      { project_id: projectId, fema: merged, updated_at: new Date().toISOString() },
      { onConflict: "project_id" },
    );
}
```

**Update `mergeDocumentIntoSubjectData`** to route `flood_map` to the new function:
```typescript
export async function mergeDocumentIntoSubjectData(
  projectId: string,
  documentType: string,
  structuredData: StructuredData,
): Promise<void> {
  if (!projectId || !structuredData || typeof structuredData !== "object") return;

  // Route flood_map documents to the dedicated fema column
  if (documentType === "flood_map") {
    return mergeFemaData(projectId, structuredData);
  }

  // ... existing core merge logic for deed/cad/engagement ...
}
```

### Phase 5: Update Flood Map Page – `src/app/project/[projectId]/subject/flood-map/page.tsx`

**Read from `subjectData.fema`** instead of `subjectData.core`:

```typescript
useEffect(() => {
  if (!subjectData) return;
  const f = (subjectData.fema ?? {}) as FemaData;
  setFemaMapNum(f.FemaMapNum ?? "");
  setFemaZone(f.FemaZone ?? "");
  // ... etc
}, [subjectData]);
```

**Save to `fema` column** instead of spreading into `core`:

```typescript
const handleSaveFema = useCallback(async () => {
  if (!subjectData) return;
  // ... build fema object ...
  await saveSubjectData({ fema: { FemaMapNum, FemaZone, FemaIsHazardZone, FemaMapDate } });
}, [...]);
```

### Phase 6: Update Subject Overview Editor – `src/components/SubjectDataEditor.tsx`

**Remove FEMA fields from `SubjectDataEditor`** (they now live on the dedicated Flood Map page), OR read/write them via `subjectData.fema` instead of `core`.

Current behavior has a "FEMA Flood Data" `SectionCard` that reads/writes `core.FemaMapNum`, etc. This should be updated to read from `subjectData.fema`:

```typescript
// Add fema state
const [fema, setFema] = useState<FemaData>({});

useEffect(() => {
  if (subjectData) {
    setCore(subjectData.core as CoreData);
    setTaxes(subjectData.taxes);
    setFema(subjectData.fema ?? {});
  }
}, [subjectData]);

// In handleSave:
await saveSubjectData({ core: core as SubjectData, taxes, fema });
```

Update the FEMA form fields to use `fema.FemaMapNum` instead of `(core as Record<string, unknown>).FemaMapNum`.

### Phase 7: Update `useSubjectData` Hook – `src/hooks/useSubjectData.ts`

Ensure the hook fetches and persists the `fema` column. The current `select("*")` already fetches all columns, so the `fema` column will be included automatically once the migration is applied. No code changes needed in the hook itself, but ensure the `saveSubjectData` type signature allows passing `fema`:

```typescript
// Already handled: Partial<Omit<SubjectDataRow, "id" | "project_id" | "updated_at">>
// This includes `fema` since SubjectDataRow now has a `fema` field.
```

### Phase 8: Update Prompt Builder – `src/lib/prompt-builder.ts`

The `buildReportPrompt` function reads `subject_data.core` to build AI prompts. If any prompt references FEMA data from `core`, it needs to also read `fema`. Check and update:

```typescript
// When building context for subject-site-summary, also include fema data
const femaData = subjectRow?.fema;
if (femaData && Object.keys(femaData).length > 0) {
  prompt += `## FEMA Flood Data\n\n${JSON.stringify(femaData, null, 2)}\n\n`;
}
```

### Phase 9: Update Projects List Query – `src/lib/supabase-queries.ts`

The `fetchProjectsList` query joins `subject_data(core)`. If any list view needs FEMA info, update to also fetch `fema`. Currently only `Address` is used from core for the list, so no FEMA column fetch is needed here.

### Phase 10: Run Migrations

After creating the migration file, apply it to the Supabase instance:

```bash
# Option A: Via Supabase CLI (if configured)
supabase db push

# Option B: Direct SQL execution against the Supabase database
# Connect to the Supabase Postgres instance and run the migration SQL manually
# via the Supabase Dashboard SQL Editor or psql CLI

# Option C: If using supabase migration tooling
supabase migration up
```

**CRITICAL**: Verify the migration was applied by checking:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'subject_data';
```

And verify FEMA data was migrated:
```sql
SELECT id, project_id, fema, core->'FemaMapNum' as leftover_fema
FROM subject_data
LIMIT 10;
```

The `leftover_fema` should be `NULL` (removed from core), and `fema` should contain the values.

Also verify that migration `014_atomic_subject_core_merge.sql` has been applied:
```sql
SELECT proname FROM pg_proc WHERE proname = 'merge_subject_core';
```

## Files Changed Summary

| File | Change |
|------|--------|
| `supabase/migrations/015_fema_column.sql` | **NEW** — Add `fema` column, migrate data from `core` |
| `src/types/comp-data.ts` | Add `FemaData` interface, update `SubjectDataRow` |
| `src/app/projects/new/page.tsx` | Separate FEMA data into `fema` field during initial seed |
| `src/server/subject-data/merge.ts` | Remove `flood_map` from `MERGE_MAP`, add `mergeFemaData()` |
| `src/app/project/[projectId]/subject/flood-map/page.tsx` | Read/write `subjectData.fema` instead of `subjectData.core` |
| `src/components/SubjectDataEditor.tsx` | Read/write FEMA from `subjectData.fema` |
| `src/hooks/useSubjectData.ts` | No changes needed (already fetches `*`, types flow through) |
| `src/lib/prompt-builder.ts` | Include `fema` column data in report prompts |
| `src/lib/supabase-queries.ts` | Potentially update any queries that need FEMA data |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migration not applied → old FEMA data stuck in `core` | Migration includes data transfer; verify with SQL queries after applying |
| Rollback needed | Migration is additive (new column). Rollback = drop column + re-add FEMA keys to core. But data in `core` was already cleaned, so keep a backup first |
| `merge_subject_core` RPC still updates core with FEMA keys | Remove `flood_map` from `MERGE_MAP` so the RPC is never called with FEMA keys |
| Report prompts lose FEMA context | Explicitly add `fema` column data to prompt builder |
| Existing projects have FEMA in core | Migration step 2 handles backfill |

## Testing Checklist

- [ ] Migration applies cleanly to a fresh DB and to the existing production DB
- [ ] Existing FEMA data migrated from `core` to `fema` column
- [ ] FEMA keys removed from `core` after migration
- [ ] New project onboarding: FEMA data appears in `subject_data.fema`, not `core`
- [ ] New project onboarding: CAD data (APN, Legal, Land Size, Year Built) appears in `subject_data.core`
- [ ] Subject Overview page shows CAD-extracted fields
- [ ] Flood Map page shows FEMA fields from `fema` column
- [ ] Saving on Subject Overview doesn't affect `fema`
- [ ] Saving on Flood Map page updates `fema` column only
- [ ] Document reprocessing for flood_map writes to `fema`
- [ ] Document reprocessing for CAD writes to `core`
- [ ] Report generation includes FEMA data in prompts

## Execution Order

1. Create migration `015_fema_column.sql`
2. Update TypeScript types (`comp-data.ts`)
3. Update merge logic (`merge.ts`)
4. Update onboarding page (`new/page.tsx`)
5. Update flood map page (`flood-map/page.tsx`)
6. Update subject data editor (`SubjectDataEditor.tsx`)
7. Update prompt builder (`prompt-builder.ts`)
8. Run `pnpm build` / `tsc --noEmit` to verify type safety
9. **Run migrations against the database**
10. End-to-end test: create a new project, verify subject data and FEMA data are in their respective columns
