import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDriveItemMetadata, listFolderChildren } from "~/lib/drive-api";
import type { ProjectFolderStructure } from "~/utils/projectStore";

export interface SourceFolderCandidate {
  id: string;
  name: string;
  score: number;
}

function parseFolderStructure(
  raw: unknown,
): ProjectFolderStructure | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return raw as ProjectFolderStructure;
}

function compsFolderKeyFromDbType(
  db: string,
): "land" | "sales" | "rentals" | null {
  switch (db) {
    case "Land":
      return "land";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
    default:
      return null;
  }
}

export function getCompsFolderIdForType(
  fs: ProjectFolderStructure | undefined,
  dbType: string,
): string | null {
  const key = compsFolderKeyFromDbType(dbType);
  if (!key || !fs?.compsFolderIds) return null;
  const id = fs.compsFolderIds[key];
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null;
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Higher score = better match to the comp address (token overlap + substring).
 */
export function scoreFolderNameAgainstAddress(
  folderName: string,
  address: string,
): number {
  const a = normalizeForMatch(address);
  const f = normalizeForMatch(folderName);
  if (!a || !f) return 0;
  if (f.includes(a) || a.includes(f)) return 100;
  const tokensA = a.split(" ").filter((t) => t.length > 0);
  const tokensF = f.split(" ").filter((t) => t.length > 0);
  if (tokensA.length === 0) return 0;
  let hits = 0;
  for (const t of tokensA) {
    if (t.length < 2) continue;
    if (f.includes(t)) {
      hits += 1;
      continue;
    }
    for (const tf of tokensF) {
      if (tf.includes(t) || t.includes(tf)) {
        hits += 0.75;
        break;
      }
    }
  }
  return Math.min(99, Math.round((hits / tokensA.length) * 90));
}

export interface SourceFolderCandidatesResult {
  candidates: SourceFolderCandidate[];
  /** When set, the source project has no comps folder id in folder_structure. */
  error?: string;
}

/**
 * Lists comp subfolders under the source project's type-specific comps folder
 * (e.g. `folder_structure.compsFolderIds.land`) and scores them against the
 * comparable's address for display ordering.
 */
export async function getSourceFolderCandidatesForComp(input: {
  supabase: SupabaseClient;
  token: string;
  sourceCompId: string;
}): Promise<SourceFolderCandidatesResult> {
  const { supabase, token, sourceCompId } = input;

  const { data: source, error: srcErr } = await supabase
    .from("comparables")
    .select("id, project_id, type, address")
    .eq("id", sourceCompId)
    .single();

  if (srcErr ?? !source) {
    return { candidates: [], error: "Source comparable not found" };
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("folder_structure")
    .eq("id", source.project_id as string)
    .single();

  if (projErr ?? !project) {
    return { candidates: [], error: "Source project not found" };
  }

  const fs = parseFolderStructure(project.folder_structure);
  const dbType = String(source.type ?? "Land");
  const compsRootId = getCompsFolderIdForType(fs, dbType);

  if (!compsRootId) {
    return {
      candidates: [],
      error:
        "Source project has no comps folder in folder_structure for this comp type.",
    };
  }

  const address = String(source.address ?? "").trim();

  let folders;
  try {
    folders = await listFolderChildren(token, compsRootId, {
      foldersOnly: true,
      pageSize: 200,
    });
  } catch (e) {
    console.error("[source-folder-candidates] listFolderChildren:", e);
    return {
      candidates: [],
      error: "Could not list folders in Drive — check permissions.",
    };
  }

  const candidates: SourceFolderCandidate[] = folders.map((f) => ({
    id: f.id,
    name: f.name,
    score: scoreFolderNameAgainstAddress(f.name, address),
  }));

  candidates.sort((a, b) => b.score - a.score);

  return { candidates };
}

/**
 * Ensures `folderId` is a Drive folder whose parent is the project comps root
 * (e.g. land/sales/rentals folder under `comps/`).
 */
export async function verifySourceFolderUnderCompsRoot(
  token: string,
  folderId: string,
  expectedCompsRootId: string,
): Promise<boolean> {
  try {
    const meta = await getDriveItemMetadata(token, folderId);
    if (meta.mimeType !== "application/vnd.google-apps.folder") return false;
    const parent = meta.parents?.[0];
    return parent === expectedCompsRootId;
  } catch {
    return false;
  }
}
