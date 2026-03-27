# Database Schema

All tables live in Supabase PostgreSQL. The `pgvector` extension is enabled for embedding columns.

## Entity Relationship Diagram

```mermaid
erDiagram
    projects ||--o{ comparables : "has many"
    projects ||--o{ maps : "has many"
    projects ||--o{ photo_analyses : "has many"
    projects ||--o{ report_sections : "has many"
    projects ||--o{ project_documents : "has many"
    projects ||--o{ page_locks : "has many"
    maps ||--o{ map_markers : "has many"
    comparables ||--o{ map_markers : "linked via comp_id"
    comparables ||--o| maps : "linked_comp_id (comp location maps)"
    report_sections ||--o{ report_section_history : "has many"

    projects {
        uuid id PK
        text name
        text client_company
        text client_name
        text property_type
        text subject_photos_folder_id
        text project_folder_id
        jsonb subject
        timestamptz created_at
        timestamptz updated_at
    }

    comparables {
        text id PK
        uuid project_id FK
        text type "Land | Sales | Rentals"
        text number
        text address
        text address_for_display
        jsonb apn
        text instrument_number
        text folder_id
        jsonb images
        timestamptz created_at
        timestamptz updated_at
    }

    maps {
        text id PK
        uuid project_id FK
        text type
        text linked_comp_id FK
        jsonb map_center
        numeric map_zoom
        numeric bubble_size
        boolean hide_ui
        numeric document_frame_size
        jsonb drawings
        timestamptz created_at
        timestamptz updated_at
    }

    map_markers {
        text id PK
        text map_id FK
        text comp_id FK
        jsonb marker_position
        jsonb bubble_position
        boolean is_tail_pinned
        jsonb pinned_tail_tip_position
        timestamptz created_at
        timestamptz updated_at
    }

    page_locks {
        uuid project_id PK_FK
        text page_key PK
        uuid locked_by FK
        timestamptz locked_at
    }

    photo_analyses {
        uuid id PK
        uuid project_id FK
        text file_name
        text category
        text label
        text description
        jsonb improvements_observed
        text property_type
        text subject_address
        text project_folder_id
        text file_id
        int sort_order
        boolean is_included
        timestamptz created_at
        timestamptz updated_at
    }

    report_sections {
        uuid id PK
        uuid project_id FK
        text section_key
        text content
        int version
        jsonb generation_context
        vector_768 embedding
        text property_type
        text city
        text county
        text subject_address
        timestamptz created_at
        timestamptz updated_at
    }

    report_section_history {
        uuid id PK
        uuid report_section_id FK
        text content
        int version
        jsonb generation_context
        timestamptz created_at
    }

    project_documents {
        uuid id PK
        uuid project_id FK
        text document_type
        text document_label
        text file_id
        text file_name
        text mime_type
        text extracted_text
        jsonb structured_data
        vector_768 embedding
        timestamptz processed_at
        timestamptz created_at
        timestamptz updated_at
    }

    knowledge_base {
        uuid id PK
        text gem_name
        text content_type
        text input
        text output
        vector_768 embedding
        timestamptz created_at
    }
```

---

## Table Details

### `projects`

The root entity. One row per appraisal project. The `subject` JSONB column stores detailed subject property information (address, legal description, coordinates, etc.).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `name` | text | Project name |
| `client_company` | text | Client's company |
| `client_name` | text | Client contact name |
| `property_type` | text | e.g., Commercial, Vacant Land |
| `subject_photos_folder_id` | text | Google Drive folder ID for subject photos |
| `project_folder_id` | text | Google Drive project folder ID |
| `subject` | jsonb | Subject property details (address, coords, legal, etc.) |
| `created_at` | timestamptz | Auto-set |
| `updated_at` | timestamptz | Auto-updated via trigger |

### `comparables`

Individual comparable properties linked to a project.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK (app-generated ID) |
| `project_id` | uuid | FK → projects, CASCADE |
| `type` | text | `'Land'`, `'Sales'`, or `'Rentals'` (CHECK constraint) |
| `number` | text | Comp number for display |
| `address` | text | Full address |
| `address_for_display` | text | Formatted display address |
| `apn` | jsonb | Array of APN values |
| `instrument_number` | text | Deed instrument number |
| `folder_id` | text | Google Drive folder for this comp |
| `images` | jsonb | Array of image references |
| `created_at` / `updated_at` | timestamptz | |

### `maps`

Map view configurations. Each map has a type that determines its purpose.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK (app-generated, e.g., `neighborhood-map`) |
| `project_id` | uuid | FK → projects, CASCADE |
| `type` | text | `neighborhood`, `subject-location`, `land`, `sales`, `rentals`, `comp-location` |
| `linked_comp_id` | text | FK → comparables (for per-comp location maps) |
| `map_center` | jsonb | `{ lat, lng }` |
| `map_zoom` | numeric | Google Maps zoom level |
| `bubble_size` | numeric | Scale factor for map bubbles |
| `hide_ui` | boolean | Hide UI elements for screenshot mode |
| `document_frame_size` | numeric | Document overlay scale |
| `drawings` | jsonb | Polygons, circles, polylines, labels drawn on map |
| `created_at` / `updated_at` | timestamptz | |

### `map_markers`

Per-comparable marker positions and bubble positions on a map.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK |
| `map_id` | text | FK → maps, CASCADE |
| `comp_id` | text | FK → comparables, CASCADE |
| `marker_position` | jsonb | `{ lat, lng }` — pin on map |
| `bubble_position` | jsonb | `{ x, y }` — info bubble position |
| `is_tail_pinned` | boolean | Whether the bubble tail is pinned |
| `pinned_tail_tip_position` | jsonb | `{ x, y }` — tail endpoint |
| `created_at` / `updated_at` | timestamptz | |

### `page_locks`

Prevents concurrent editing of the same page by multiple users.

| Column | Type | Notes |
|--------|------|-------|
| `project_id` | uuid | Composite PK, FK → projects |
| `page_key` | text | Composite PK (e.g., `reports/neighborhood`) |
| `locked_by` | uuid | FK → auth.users |
| `locked_at` | timestamptz | |

### `photo_analyses`

Stores AI-generated analysis of subject photos plus user-managed ordering.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `project_id` | uuid | FK → projects, CASCADE |
| `file_name` | text | Original filename |
| `category` | text | AI-assigned category (exterior, interior, site, etc.) |
| `label` | text | AI-assigned descriptive label |
| `description` | text | AI-generated description |
| `improvements_observed` | jsonb | Structured observations |
| `property_type` | text | |
| `subject_address` | text | |
| `project_folder_id` | text | Drive folder reference |
| `file_id` | text | Google Drive file ID (for preview URLs) |
| `sort_order` | int | User-defined display order |
| `is_included` | boolean | Whether to include in final report |
| `created_at` / `updated_at` | timestamptz | |

### `report_sections`

Generated narrative content for each report section, with vector embeddings for similarity search.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `project_id` | uuid | FK → projects, CASCADE |
| `section_key` | text | e.g., `neighborhood`, `zoning`, `ownership` |
| `content` | text | Markdown narrative content |
| `version` | int | Incremented on each update |
| `generation_context` | jsonb | Prompt/context used to generate |
| `embedding` | vector(768) | Text embedding for similarity search |
| `property_type` | text | Metadata for cross-project search |
| `city` | text | |
| `county` | text | |
| `subject_address` | text | |
| `created_at` / `updated_at` | timestamptz | |
| | | **UNIQUE** (`project_id`, `section_key`) |

### `report_section_history`

Immutable version history for report sections.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `report_section_id` | uuid | FK → report_sections, CASCADE |
| `content` | text | Content at this version |
| `version` | int | Version number |
| `generation_context` | jsonb | Context used for this version |
| `created_at` | timestamptz | |

### `project_documents`

Documents uploaded or linked for AI extraction and context building.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `project_id` | uuid | FK → projects, CASCADE |
| `document_type` | text | `deed`, `flood_map`, `cad`, `zoning_map`, `neighborhood_map`, `location_map`, `engagement`, `other` |
| `document_label` | text | User-provided label |
| `file_id` | text | Google Drive file ID (optional) |
| `file_name` | text | Original filename |
| `mime_type` | text | MIME type |
| `extracted_text` | text | AI-extracted summary |
| `structured_data` | jsonb | Type-specific extracted fields |
| `embedding` | vector(768) | Text embedding |
| `processed_at` | timestamptz | Null until AI processing completes |
| `created_at` / `updated_at` | timestamptz | |

### `knowledge_base`

Curated prompt examples and knowledge for AI generation. Seeded from CSV.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `gem_name` | text | Gemini gem/prompt category name |
| `content_type` | text | Type of content (prompt, example, etc.) |
| `input` | text | Input/prompt template |
| `output` | text | Expected/example output |
| `embedding` | vector(768) | Text embedding |
| `created_at` | timestamptz | |

---

## Vector Search Functions (RPC)

These PostgreSQL functions use pgvector's cosine distance (`<=>`) for similarity search:

| Function | Searches | Parameters |
|----------|----------|-----------|
| `search_similar_report_sections` | `report_sections` | `query_embedding`, optional `match_section_key`, `similarity_threshold`, `match_limit` |
| `search_similar_documents` | `project_documents` | `query_embedding`, `match_project_id`, `similarity_threshold`, `match_limit` |
| `search_similar_knowledge` | `knowledge_base` | `query_embedding`, optional `match_gem_name`, `match_content_type`, `similarity_threshold`, `match_limit` |

---

## RLS Policy

All tables have RLS enabled with a single policy: **"Authenticated full access"** — any authenticated user can read/write all rows. This is intentional since the app is only used by two people.

## Realtime Publication

Tables broadcasting changes via Supabase Realtime: `page_locks`, `photo_analyses`, `report_sections`, `project_documents`.

## Triggers

All tables with `updated_at` use a shared `update_updated_at()` trigger function that sets `updated_at = now()` before each UPDATE.
