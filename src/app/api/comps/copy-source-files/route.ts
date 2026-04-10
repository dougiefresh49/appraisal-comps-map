import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient, getGoogleToken } from "~/utils/supabase/server";
import {
  listFolderChildren,
  findOrCreateFolder,
  copyFile,
  shareDriveFile,
  getDriveItemMetadata,
} from "~/lib/drive-api";
import { addDocument } from "~/server/documents/actions";
import { getCompDocumentSectionTag } from "~/server/comps/comp-section-tag";
import { normalizeAddressForCompMatch } from "~/server/comps/address-match";
import {
  getCompsFolderIdForType,
  getSourceFolderCandidatesForComp,
  verifySourceFolderUnderCompsRoot,
} from "~/server/comps/source-folder-candidates";
import type { CompType } from "~/types/comp-data";
import type { ProjectFolderStructure } from "~/utils/projectStore";

interface CopySourceFilesBody {
  compId?: string;
  projectId?: string;
  sourceCompId?: string;
  compsFolderId?: string;
  sectionTag?: string;
  /** User-selected comp folder when `folder_id` is missing (must sit under source project's comps folder). */
  sourceFolderId?: string;
}

function dbComparableTypeToCompType(db: string): CompType {
  switch (db) {
    case "Land":
      return "land";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
    default:
      return "land";
  }
}

function parseFolderStructure(
  raw: unknown,
): ProjectFolderStructure | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return raw as ProjectFolderStructure;
}

/**
 * When `comparables.folder_id` is null, find a Drive folder via linked `project_documents`
 * (same section_tag as the comp detail panel).
 */
async function resolveSourceFolderIdFromDocuments(input: {
  supabase: SupabaseClient;
  token: string;
  sourceProjectId: string;
  sourceCompId: string;
  dbType: string;
}): Promise<string | null> {
  const { supabase, token, sourceProjectId, sourceCompId, dbType } = input;
  const compType = dbComparableTypeToCompType(dbType);

  const sectionTag = await getCompDocumentSectionTag(
    supabase,
    sourceProjectId,
    sourceCompId,
    compType,
  );
  if (!sectionTag) return null;

  const { data: docs } = await supabase
    .from("project_documents")
    .select("file_id")
    .eq("project_id", sourceProjectId)
    .eq("section_tag", sectionTag)
    .not("file_id", "is", null)
    .limit(10);

  for (const row of docs ?? []) {
    const fid = (row as { file_id: string | null }).file_id?.trim();
    if (!fid) continue;
    try {
      const meta = await getDriveItemMetadata(token, fid);
      if (meta.mimeType === "application/vnd.google-apps.folder") {
        return meta.id;
      }
      const parent = meta.parents?.[0];
      if (parent) return parent;
    } catch {
      /* try next document */
    }
  }

  return null;
}

/**
 * If the selected source row has no `folder_id`, find another comparable in the
 * same project and type with the same normalized address (handles duplicate rows
 * and leading-zero street numbers).
 */
async function resolveFolderIdFromSiblingComparable(input: {
  supabase: SupabaseClient;
  projectId: string;
  dbType: string;
  address: string;
}): Promise<string | null> {
  const { supabase, projectId, dbType, address } = input;
  const targetNorm = normalizeAddressForCompMatch(address);
  if (!targetNorm) return null;

  const { data: rows } = await supabase
    .from("comparables")
    .select("folder_id, address")
    .eq("project_id", projectId)
    .eq("type", dbType);

  for (const row of rows ?? []) {
    const fid = (row as { folder_id?: string | null }).folder_id?.trim();
    if (!fid) continue;
    const addr = String((row as { address?: string }).address ?? "");
    if (normalizeAddressForCompMatch(addr) === targetNorm) {
      return fid;
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    let body: CopySourceFilesBody;
    try {
      body = (await request.json()) as CopySourceFilesBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const compId = body.compId?.trim();
    const projectId = body.projectId?.trim();
    const sourceCompId = body.sourceCompId?.trim();
    const compsFolderId = body.compsFolderId?.trim();
    const sectionTag = body.sectionTag?.trim();
    const userPickedSourceFolderId = body.sourceFolderId?.trim();

    if (!compId || !projectId || !sourceCompId || !sectionTag) {
      return NextResponse.json(
        {
          error:
            "compId, projectId, sourceCompId, and sectionTag are required",
        },
        { status: 400 },
      );
    }

    if (compId === sourceCompId) {
      return NextResponse.json(
        { error: "Source comp must differ from the current comp" },
        { status: 400 },
      );
    }

    const { token, error: driveAuthError, code } = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            driveAuthError ??
            "Not authenticated — please sign in to grant Drive access",
          code,
        },
        { status: 401 },
      );
    }

    const supabase = await createClient();

    const { data: current, error: curErr } = await supabase
      .from("comparables")
      .select("id, project_id, address, folder_id")
      .eq("id", compId)
      .single();

    if (curErr ?? !current) {
      return NextResponse.json({ error: "Comparable not found" }, { status: 404 });
    }

    if ((current.project_id as string) !== projectId) {
      return NextResponse.json(
        { error: "Comparable does not belong to this project" },
        { status: 400 },
      );
    }

    const { data: source, error: srcErr } = await supabase
      .from("comparables")
      .select("id, project_id, type, address, folder_id")
      .eq("id", sourceCompId)
      .single();

    if (srcErr ?? !source) {
      return NextResponse.json(
        { error: "Source comparable not found" },
        { status: 404 },
      );
    }

    const { data: sourceProject, error: spErr } = await supabase
      .from("projects")
      .select("folder_structure")
      .eq("id", source.project_id as string)
      .single();

    if (spErr ?? !sourceProject) {
      return NextResponse.json(
        { error: "Source project not found" },
        { status: 404 },
      );
    }

    const sourceFs = parseFolderStructure(sourceProject.folder_structure);
    const sourceDbType = String(source.type ?? "Land");
    const sourceCompsRootId = getCompsFolderIdForType(sourceFs, sourceDbType);

    let sourceFolderId = "";

    if (userPickedSourceFolderId) {
      if (!sourceCompsRootId) {
        return NextResponse.json(
          {
            error:
              "Source project has no comps folder in folder_structure — cannot validate selected folder.",
          },
          { status: 400 },
        );
      }
      const ok = await verifySourceFolderUnderCompsRoot(
        token,
        userPickedSourceFolderId,
        sourceCompsRootId,
      );
      if (!ok) {
        return NextResponse.json(
          {
            error:
              "Selected folder is not a comp folder under the source project’s comps directory.",
          },
          { status: 400 },
        );
      }
      sourceFolderId = userPickedSourceFolderId;
    } else {
      sourceFolderId = (source.folder_id as string | null)?.trim() ?? "";

      if (!sourceFolderId) {
        const sibling = await resolveFolderIdFromSiblingComparable({
          supabase,
          projectId: source.project_id as string,
          dbType: sourceDbType,
          address: String(source.address ?? ""),
        });
        if (sibling) sourceFolderId = sibling;
      }

      if (!sourceFolderId) {
        const resolved = await resolveSourceFolderIdFromDocuments({
          supabase,
          token,
          sourceProjectId: source.project_id as string,
          sourceCompId,
          dbType: sourceDbType,
        });
        sourceFolderId = resolved ?? "";
      }

      if (!sourceFolderId) {
        const { candidates, error: candErr } =
          await getSourceFolderCandidatesForComp({
            supabase,
            token,
            sourceCompId,
          });

        if (candidates.length > 0) {
          return NextResponse.json(
            {
              error:
                candErr ??
                "Select which Drive folder holds this comp’s files.",
              code: "SOURCE_FOLDER_REQUIRED" as const,
              candidates: candidates.map((c) => ({
                id: c.id,
                name: c.name,
                score: c.score,
              })),
            },
            { status: 400 },
          );
        }

        return NextResponse.json(
          {
            error:
              candErr ??
              "Could not find a Drive folder for the source comp (no folder_id, no linked documents, and no comp subfolders under the project comps folder).",
          },
          { status: 400 },
        );
      }
    }

    let sourceFolderName: string;
    try {
      const srcFolderMeta = await getDriveItemMetadata(token, sourceFolderId);
      if (srcFolderMeta.mimeType !== "application/vnd.google-apps.folder") {
        return NextResponse.json(
          { error: "Source folder id does not refer to a Drive folder" },
          { status: 400 },
        );
      }
      sourceFolderName = srcFolderMeta.name;
    } catch (e) {
      console.error("[copy-source-files] getDriveItemMetadata source:", e);
      return NextResponse.json(
        { error: "Could not read the source Drive folder — check permissions." },
        { status: 400 },
      );
    }

    const sourceFiles = await listFolderChildren(token, sourceFolderId, {
      filesOnly: true,
    });

    if (sourceFiles.length === 0) {
      return NextResponse.json(
        { error: "No files found in the source comp folder" },
        { status: 400 },
      );
    }

    let destFolderId = (current.folder_id as string | null)?.trim() ?? "";

    if (!destFolderId) {
      if (!compsFolderId) {
        return NextResponse.json(
          {
            error:
              "This comp has no Drive folder — compsFolderId is required to create one",
          },
          { status: 400 },
        );
      }
      const newFolder = await findOrCreateFolder(
        token,
        compsFolderId,
        sourceFolderName,
      );
      destFolderId = newFolder.id;

      const { error: updErr } = await supabase
        .from("comparables")
        .update({ folder_id: destFolderId })
        .eq("id", compId);

      if (updErr) {
        return NextResponse.json(
          { error: updErr.message },
          { status: 500 },
        );
      }
    }

    let filesCopied = 0;
    const copied: Array<{ id: string; name: string; mimeType: string }> = [];

    for (const f of sourceFiles) {
      try {
        const copiedFile = await copyFile(token, f.id, destFolderId, f.name);
        copied.push({
          id: copiedFile.id,
          name: copiedFile.name,
          mimeType: f.mimeType,
        });
        filesCopied += 1;
      } catch (e) {
        console.error("[copy-source-files] copyFile failed:", f.name, e);
      }
    }

    if (filesCopied === 0) {
      return NextResponse.json(
        { error: "Could not copy any files — check Drive permissions" },
        { status: 500 },
      );
    }

    for (const c of copied) {
      try {
        await shareDriveFile(token, c.id);
      } catch (shareErr) {
        console.error("[copy-source-files] shareDriveFile:", shareErr);
      }

      const result = await addDocument({
        projectId,
        documentType: "other",
        sectionTag,
        fileId: c.id,
        fileName: c.name,
        mimeType: c.mimeType,
      });

      if (!result.ok) {
        console.error("[copy-source-files] addDocument:", result.error);
      }
    }

    return NextResponse.json({
      folderId: destFolderId,
      filesCopied,
    });
  } catch (error) {
    console.error("[copy-source-files] unexpected error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to copy source files",
      },
      { status: 500 },
    );
  }
}
