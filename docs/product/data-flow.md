# Data Flow by Feature

This document describes how data moves through the system for each major feature area.

---

## 1. Project Management

### Create Project

```mermaid
sequenceDiagram
    participant User
    participant NewProjectPage as /projects/new
    participant N8N as n8n
    participant GDrive as Google Drive
    participant Supabase

    User->>NewProjectPage: Fill form / select project
    NewProjectPage->>N8N: POST /projects-new (list Drive folders)
    N8N->>GDrive: List project folders
    GDrive-->>N8N: Folder list
    N8N-->>NewProjectPage: Available projects

    User->>NewProjectPage: Select project
    NewProjectPage->>N8N: POST /project-data {projectFolderId}
    N8N->>GDrive: Read project spreadsheet
    GDrive-->>N8N: Project data JSON
    N8N-->>NewProjectPage: Normalized project data

    NewProjectPage->>Supabase: insertProject() (projects + comparables + maps + markers)
    Supabase-->>NewProjectPage: Saved
```

**Data stored:** `projects`, `comparables`, `maps`, `map_markers` in Supabase.

**n8n dependency:** Required for project creation (reads Drive folder structure + spreadsheet data).

### Restore from localStorage

The `/restore` page allows migrating legacy `localStorage` data into Supabase via `insertProject()`. This is a one-time migration path.

---

## 2. Maps

### Map Types

| Map Type | Route | Purpose |
|----------|-------|---------|
| `neighborhood` | `/project/[id]/neighborhood-map` | Neighborhood boundary map with drawing tools |
| `subject-location` | `/project/[id]/subject/location-map` | Subject property location map |
| `land` | `/project/[id]/land-sales/comparables-map` | Land comparables map |
| `sales` | `/project/[id]/sales/comparables-map` | Sales comparables map |
| `rentals` | `/project/[id]/rentals/comparables-map` | Rentals comparables map |
| `comp-location` | `/project/[id]/*/comps/[compId]/location-map` | Individual comp aerial view |

### Map Data Flow

```mermaid
flowchart LR
    subgraph client ["Browser"]
        MapPage["Map Page Component"]
        useProject["useProject() hook"]
        GMaps["Google Maps SDK"]
    end

    subgraph supabase ["Supabase"]
        MapsTable["maps table"]
        MarkersTable["map_markers table"]
        CompsTable["comparables table"]
    end

    subgraph context ["Context Registration"]
        MapContext["registerMapContext()"]
        DocTable["project_documents table"]
    end

    useProject -->|"fetch on mount"| MapsTable
    useProject -->|"fetch on mount"| MarkersTable
    useProject -->|"fetch on mount"| CompsTable

    MapPage -->|"reads/updates via"| useProject
    MapPage --> GMaps

    MapPage -->|"on save/screenshot"| useProject
    useProject -->|"upsertMapView()"| MapsTable
    useProject -->|"upsertComparable()"| CompsTable

    MapPage -->|"on screenshot capture"| MapContext
    MapContext -->|"auto-register"| DocTable
```

**All map data is stored in Supabase** via the `useProject` hook. Changes are persisted on save. No n8n involvement.

**Context registration:** When a neighborhood or location map screenshot is captured, `registerMapContext()` automatically creates a `project_documents` row (if one doesn't already exist for that map type) so the map is available as context for AI report generation.

### Drawing Tools

Drawing tools (polygon, circle, polyline, street labels) store their data in the `maps.drawings` JSONB column. Each map has its own independent set of drawings.

---

## 3. Subject Photos

### Photo Processing Pipeline

```mermaid
sequenceDiagram
    participant User
    participant PhotoGrid as PhotoGrid Component
    participant API as /api/photos/process
    participant N8N as n8n
    participant GDrive as Google Drive
    participant Gemini as Gemini AI
    participant Supabase

    User->>PhotoGrid: Click "Analyze Photos"
    PhotoGrid->>API: POST {projectFolderId}
    API->>N8N: POST /subject-photos-analyze
    N8N-->>API: {total: 30}
    API-->>PhotoGrid: Total count (for progress)

    loop For each photo
        N8N->>GDrive: Download photo
        N8N->>Gemini: Classify + label + describe
        Gemini-->>N8N: Analysis result
        N8N->>Supabase: INSERT into photo_analyses
        Note over PhotoGrid: Realtime subscription updates UI
    end

    User->>PhotoGrid: Reorder, toggle inclusion, edit labels
    PhotoGrid->>Supabase: UPDATE photo_analyses (sort_order, is_included, label, etc.)
```

**n8n dependency:** Required for photo analysis (downloads from Drive, sends to Gemini, writes to Supabase).

**Realtime:** `photo_analyses` table broadcasts changes so both users see live updates.

### Photo Export (input.json)

```mermaid
sequenceDiagram
    participant User
    participant PhotoGrid as PhotoGrid Component
    participant API as /api/photos
    participant Server as photos/actions.ts
    participant Supabase
    participant N8N as n8n
    participant GDrive as Google Drive

    User->>PhotoGrid: Click "Save to Drive"
    PhotoGrid->>API: POST {projectId, projectFolderId}
    API->>Server: exportInputJson()
    Server->>Supabase: Read photo_analyses (included, sorted)
    Supabase-->>Server: Photo list
    Server->>N8N: POST /subject-photos-save-input {photos, projectFolderId}
    N8N->>GDrive: Write input.json
    N8N-->>API: Success
    API-->>PhotoGrid: Done
```

**Purpose:** The `input.json` file in Google Drive is consumed by Google Apps Script to insert images into the final Google Doc report.

---

## 4. Report Content Generation

### Generate a Report Section

```mermaid
sequenceDiagram
    participant User
    participant RSContent as ReportSectionContent
    participant API as /api/report-content
    participant Actions as reports/actions.ts
    participant PromptBuilder as prompt-builder.ts
    participant Supabase
    participant Gemini as Gemini AI

    User->>RSContent: Click "Generate"
    RSContent->>API: POST {action:"generate", projectId, section}

    API->>Actions: runReportAction()
    Actions->>PromptBuilder: buildReportPrompt()

    PromptBuilder->>Supabase: Fetch knowledge_base entries
    PromptBuilder->>Supabase: Fetch project metadata
    PromptBuilder->>Supabase: Fetch project_documents (extracted text)
    PromptBuilder->>Supabase: Fetch photo_analyses (descriptions)
    PromptBuilder->>Supabase: Fetch related report_sections
    PromptBuilder->>Supabase: RPC search_similar_report_sections (vector search for past reports)
    PromptBuilder-->>Actions: Assembled prompt

    Actions->>Gemini: generateReportSection(prompt)
    Gemini-->>Actions: Generated markdown content

    Actions->>Supabase: UPSERT report_sections + INSERT history
    Actions->>Gemini: generateEmbedding(content)
    Actions->>Supabase: UPDATE embedding

    Supabase-->>RSContent: Realtime update
    API-->>RSContent: {content, version}
```

**Key insight:** Report generation is fully server-side with **no n8n involvement**. The prompt builder assembles context from multiple Supabase tables and similar past reports (via vector search), then Gemini generates the narrative.

### Edit and Save

Manual edits go directly to Supabase via the `useReportSection` hook. Each save creates a history record and increments the version.

---

## 5. Document Processing

### Upload and Process a Document

```mermaid
sequenceDiagram
    participant User
    participant DocManager as DocumentManager
    participant API as /api/documents
    participant Actions as documents/actions.ts
    participant Gemini as Gemini AI
    participant Supabase

    alt File Upload
        User->>DocManager: Select file + document type
        DocManager->>API: POST FormData (file + metadata)
    else Drive File ID
        User->>DocManager: Enter Drive file ID + type
        DocManager->>API: POST JSON {fileId, documentType}
    end

    API->>Actions: addDocument()
    Actions->>Supabase: INSERT project_documents (status: pending)
    Actions-->>API: {documentId}
    API-->>DocManager: Success

    Note over Actions: Fire-and-forget async processing

    alt Has file buffer
        Actions->>Gemini: extractDocumentContent(buffer, mimeType, typePrompt)
    else Has Drive file ID
        Actions->>Actions: downloadDriveFile(fileId)
        Actions->>Gemini: extractDocumentContent(buffer, mimeType, typePrompt)
    end

    Gemini-->>Actions: {extractedText, structuredData}
    Actions->>Gemini: generateEmbedding(extractedText)
    Actions->>Supabase: UPDATE (extracted_text, structured_data, embedding, processed_at)

    Note over DocManager: Realtime subscription shows "Processed"
```

**No n8n involvement.** Document processing happens entirely in the Next.js server using Gemini for extraction and embedding generation.

**Type-specific prompts** (`src/lib/document-prompts.ts`) instruct Gemini to extract domain-specific fields based on document type (deed, flood map, CAD, etc.).

---

## 6. Comparables Data

### Refresh Comps from Spreadsheet

```mermaid
sequenceDiagram
    participant User
    participant CompsPage as ComparablesPageContent
    participant API as /api/comps-data
    participant N8N as n8n
    participant GSheet as Google Spreadsheet
    participant Supabase

    User->>CompsPage: Click "Refresh"
    CompsPage->>API: POST {projectFolderId, type}
    API->>N8N: POST /comps-data
    N8N->>GSheet: Read comp data + images
    GSheet-->>N8N: Data
    N8N-->>API: {comps, imageMap}
    API-->>CompsPage: Comp data

    CompsPage->>Supabase: upsertComparable() for each comp
```

**n8n dependency:** Required for reading comp data from Google Spreadsheet.

### Comp Parser

The `/parser/[type]` page uses n8n to:
1. List comp folders in Drive (`/comps-folder-list`)
2. Get folder details (`/comps-folder-details`)
3. Parse folder contents with AI (`/comps-parser`)
4. Check for duplicates (`/comps-exists`)

All parser interactions go through n8n webhooks.

---

## 7. AI Context Pipeline (Process-Once, Query-Many)

```mermaid
flowchart TB
    subgraph sources ["Context Sources (processed once)"]
        Photos["Subject Photos → photo_analyses"]
        Docs["Documents → project_documents"]
        KB["Knowledge Base → knowledge_base"]
        PastReports["Prior Reports → report_sections (null project_id)"]
    end

    subgraph storage ["Vector Storage (Supabase + pgvector)"]
        PhotoRows["photo_analyses (descriptions)"]
        DocRows["project_documents (extracted_text + embedding)"]
        KBRows["knowledge_base (output + embedding)"]
        SectionRows["report_sections (content + embedding)"]
    end

    subgraph generation ["Report Generation"]
        PB["prompt-builder.ts"]
        Gemini["Gemini AI"]
    end

    sources --> storage
    storage -->|"direct fetch + vector search"| PB
    PB -->|"assembled prompt"| Gemini
    Gemini -->|"generated content"| SectionRows
```

**Philosophy:** Each piece of project context (photos, documents, maps) is processed once and stored with embeddings. When generating report content, the prompt builder gathers all relevant context from Supabase (including vector similarity search for past reports) and assembles a single comprehensive prompt for Gemini.

---

## Summary: n8n vs Direct

| Feature | n8n | Direct (Supabase/Gemini) |
|---------|-----|--------------------------|
| Project creation | **Yes** (reads Drive/Spreadsheet) | |
| Cover photo data | **Yes** (reads Drive) | |
| Photo analysis | **Yes** (Drive → Gemini → Supabase) | |
| Photo export (input.json) | **Yes** (writes to Drive) | |
| Comp data refresh | **Yes** (reads Spreadsheet) | |
| Comp parser | **Yes** (Drive → AI) | |
| Comp duplicate check | **Yes** (queries Spreadsheet) | |
| Report generation | | **Direct** (Gemini + Supabase) |
| Document processing | | **Direct** (upload/Drive → Gemini → Supabase) |
| Seed/backfill | | **Direct** (local files → Gemini → Supabase) |
| Map state | | **Direct** (Supabase only) |
| Auth | | **Direct** (Supabase Auth + Google OAuth) |
| Realtime collaboration | | **Direct** (Supabase Realtime) |
