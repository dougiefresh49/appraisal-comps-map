# 039 — Remove n8n from new-project folder picker (`/projects-new`)

**Status:** Resolved (in-app list shipped)  
**Area:** Onboarding / Google Drive / n8n deprecation  
**Priority:** Medium (operational simplification + fewer moving parts for agents and humans)

## Summary

Creating a project from `/projects/new` still triggers the n8n workflow **[POST] Create New Project** (`/projects-new`). That workflow does **not** implement onboarding logic in the app sense—it only **lists child folders** under a fixed Google Drive parent using n8n’s Google Drive node, then returns `{ projects: [{ id, name }, ...] }` for the folder picker.

**Subfolder discovery after you pick a project root** (subject, reports, comps, engagement, spreadsheet candidates) is **already in-app** via `discoverFolderStructure` and `/api/projects/discover`, which replaced the older n8n `_GET_Project_Subfolder_Ids` pattern (see `src/lib/project-discovery.ts`).

So the user’s intuition is correct for the **heavy** work: that is in the app. The remaining n8n call is a **narrow, list-only** dependency that can be removed once the same list is served from the Next.js app with the signed-in user’s Drive token.

## Current behavior (what you saw this morning)

1. User opens **Create New Project** (`/projects/new`).
2. Client hook `useProjectsList()` (`src/hooks/useProjectsList.ts`) runs `POST ${NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL}/projects-new` with no body.
3. n8n lists folders under a **hardcoded parent folder ID** in the workflow JSON (Google Drive “Search files and folders” node), aggregates results, responds as `projects`.
4. User selects one folder; the wizard continues with in-app APIs (`/api/projects/discover`, engagement/flood parsing, etc.).

Exported workflow reference: `docs/n8n/workflows/bexUZ1c9XKBq0f2N-_POST_Create_New_Project.json` (webhook path `projects-new`).

## Why n8n is still here (historical)

The picker predates reliable in-browser Drive listing with the same OAuth identity as the rest of the app. n8n held a service account or fixed OAuth credential and a known parent folder ID, so the list was easy to centralize there.

Today, the app already has:

- `getGoogleToken()` + `listFolderChildren()` (`src/lib/drive-api.ts`)
- `POST /api/drive/list` — list children of any `folderId` with the **current user’s** token (`src/app/api/drive/list/route.ts`)

So the list operation does not need n8n except that **no first-party route yet exposes “list appraisal project roots under configured parent”** with the same response shape as `useProjectsList` expects.

## Problem statement

- **Confusing operations:** Any “create project” flow shows n8n traffic even though business logic is in-app; runbooks and agents assume n8n might still be doing discovery.
- **Coupling:** Onboarding depends on n8n uptime and on a parent folder ID maintained inside n8n, not in versioned app config.
- **Identity mismatch risk:** Picker uses whichever Google account is wired to n8n; the rest of onboarding uses the **Supabase user’s** `provider_token` for Drive. Those should be the same in production, but it’s an avoidable split-brain.

## Proposed resolution

1. **Config:** Add a server-side env var for the Drive parent folder that contains appraisal project roots, e.g. `GOOGLE_DRIVE_APPRAISAL_PROJECTS_PARENT_FOLDER_ID` (name TBD), **or** document reusing an existing convention if one exists. Do **not** leave the ID only in n8n JSON after cutover.
2. **API:** Add something like `POST /api/projects/list-drive-roots` that:
   - Authenticates like other Drive routes (`getGoogleToken`).
   - Calls `listFolderChildren(token, parentFolderId, { foldersOnly: true })`.
   - Returns `{ projects: { id, name }[] }` to match `useProjectsList` / `DriveProject`.
3. **Client:** Change `useProjectsList` to fetch that route instead of `NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL + "/projects-new"`.
4. **Cleanup:** Update product docs that mention `/projects-new` (`docs/product/n8n-dependencies.md`, `data-flow.md`, `architecture-overview.md`, `api-reference.md`, `README.md`). Optionally archive or annotate the n8n workflow export as legacy.
5. **Env:** `NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL` remains required today for other webhooks (e.g. comps exists/data, seed photo backfill per `AGENTS.md`). This issue only removes **one** consumer; do not mark n8n optional for the whole repo until those are addressed.

## Acceptance criteria

- [x] New project folder picker works without calling n8n `/projects-new`.
- [x] Parent folder for project roots is configured via env (`GOOGLE_DRIVE_APPRAISAL_PROJECTS_PARENT_FOLDER_ID`), not only in n8n.
- [x] Clear failure mode when env is missing (503 from `GET /api/projects/list-drive-roots`) or Drive errors (500 / message).
- [x] Product docs (`docs/product/*.md`) updated — live flow documented; historical `/projects-new` only in “removed from n8n” / legacy notes where relevant.

**Implementation:** `GET /api/projects/list-drive-roots` + `useProjectsList` → same `{ projects: [{ id, name }] }` shape as before.

## References

| What | Where |
|------|--------|
| Client picker hook | `src/hooks/useProjectsList.ts` |
| New project wizard | `src/app/projects/new/page.tsx` |
| In-app subfolder discovery | `src/lib/project-discovery.ts`, `src/app/api/projects/discover/route.ts` |
| Existing Drive list API | `src/app/api/drive/list/route.ts` |
| n8n workflow export | `docs/n8n/workflows/bexUZ1c9XKBq0f2N-_POST_Create_New_Project.json` |
| Prior product write-up | `docs/product/n8n-dependencies.md` (§ project folder picker) |

## Dependencies / notes

- Coordinate the parent folder ID with whoever maintains the Drive hierarchy; it must match what n8n used so users see the same list.
- If multiple tenants or parents are ever needed, the API may need a per-user or per-org mapping later; out of scope unless product requests it.
