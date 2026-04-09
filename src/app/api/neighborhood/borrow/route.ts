import { NextResponse } from "next/server";
import {
  DriveAuthError,
  downloadFile,
  listFolderChildren,
  uploadOrUpdateFile,
} from "~/lib/drive-api";
import { createClient, getGoogleToken } from "~/utils/supabase/server";
import type { ProjectFolderStructure } from "~/utils/projectStore";

export interface NeighborhoodBorrowGetResponse {
  boundaries: {
    north: string;
    south: string;
    east: string;
    west: string;
  } | null;
  narrative: string | null;
  mapData: {
    mapCenter: { lat: number; lng: number };
    mapZoom: number;
    bubbleSize: number;
    drawings: Record<string, unknown>;
    markers: Array<Record<string, unknown>>;
  } | null;
  hasMapImage: boolean;
  mapImageFileId: string | null;
}

function parseFolderStructure(
  raw: Record<string, unknown> | null | undefined,
): ProjectFolderStructure | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return raw as ProjectFolderStructure;
}

function neighborhoodBoundariesFromCore(
  core: Record<string, unknown> | null | undefined,
): NeighborhoodBorrowGetResponse["boundaries"] {
  if (!core || typeof core !== "object") return null;
  const nb = core.neighborhoodBoundaries;
  if (!nb || typeof nb !== "object" || Array.isArray(nb)) return null;
  const o = nb as Record<string, unknown>;
  const north = typeof o.north === "string" ? o.north : "";
  const south = typeof o.south === "string" ? o.south : "";
  const east = typeof o.east === "string" ? o.east : "";
  const west = typeof o.west === "string" ? o.west : "";
  const hasAny =
    north.trim().length > 0 ||
    south.trim().length > 0 ||
    east.trim().length > 0 ||
    west.trim().length > 0;
  if (!hasAny) return null;
  return { north, south, east, west };
}

interface MapRowDb {
  id: string;
  map_center: { lat: number; lng: number };
  map_zoom: number;
  bubble_size: number;
  drawings: Record<string, unknown>;
}

interface MapMarkerRowDb {
  id: string;
  map_id: string;
  comp_id: string | null;
  marker_position: { lat: number; lng: number } | null;
  bubble_position: { lat: number; lng: number } | null;
  is_tail_pinned: boolean;
  pinned_tail_tip_position: { lat: number; lng: number } | null;
}

function markerToJson(row: MapMarkerRowDb): Record<string, unknown> {
  return {
    id: row.id,
    mapId: row.map_id,
    compId: row.comp_id ?? undefined,
    markerPosition: row.marker_position,
    bubblePosition: row.bubble_position,
    isTailPinned: row.is_tail_pinned,
    pinnedTailTipPosition: row.pinned_tail_tip_position,
  };
}

function asDrawingsRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

/**
 * GET /api/neighborhood/borrow?source_project_id=UUID
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceProjectId =
      searchParams.get("source_project_id")?.trim() ?? "";

    if (!sourceProjectId) {
      return NextResponse.json(
        { error: "source_project_id is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data: projectMeta, error: projectErr } = await supabase
      .from("projects")
      .select("id, folder_structure")
      .eq("id", sourceProjectId)
      .maybeSingle();

    if (projectErr) {
      console.error("[neighborhood-borrow]", projectErr.message);
      return NextResponse.json(
        { error: "Failed to verify project" },
        { status: 500 },
      );
    }
    if (!projectMeta) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const [subjectRes, sectionRes, mapRes] = await Promise.all([
      supabase
        .from("subject_data")
        .select("core")
        .eq("project_id", sourceProjectId)
        .maybeSingle(),
      supabase
        .from("report_sections")
        .select("content")
        .eq("project_id", sourceProjectId)
        .eq("section_key", "neighborhood")
        .maybeSingle(),
      supabase
        .from("maps")
        .select("id, map_center, map_zoom, bubble_size, drawings")
        .eq("project_id", sourceProjectId)
        .eq("type", "neighborhood")
        .maybeSingle(),
    ]);

    const core = subjectRes.data?.core as Record<string, unknown> | undefined;
    const boundaries = neighborhoodBoundariesFromCore(core);

    let narrative: string | null = null;
    const sectionData = sectionRes.data as { content?: unknown } | null;
    const rawContent = sectionData?.content;
    if (typeof rawContent === "string" && rawContent.trim().length > 0) {
      narrative = rawContent;
    }

    let mapData: NeighborhoodBorrowGetResponse["mapData"] = null;
    const mapRow = mapRes.data as MapRowDb | null;
    if (mapRow?.id) {
      const markersRes = await supabase
        .from("map_markers")
        .select(
          "id, map_id, comp_id, marker_position, bubble_position, is_tail_pinned, pinned_tail_tip_position",
        )
        .eq("map_id", mapRow.id);

      const markerRows = (markersRes.data ?? []) as MapMarkerRowDb[];

      mapData = {
        mapCenter: mapRow.map_center,
        mapZoom: Number(mapRow.map_zoom),
        bubbleSize: Number(mapRow.bubble_size),
        drawings: asDrawingsRecord(mapRow.drawings),
        markers: markerRows.map(markerToJson),
      };
    }

    let hasMapImage = false;
    let mapImageFileId: string | null = null;

    const fs = parseFolderStructure(
      projectMeta.folder_structure as Record<string, unknown> | null,
    );
    const reportMapsFolderId = fs?.reportMapsFolderId?.trim();

    if (reportMapsFolderId) {
      const tokenResult = await getGoogleToken();
      if (tokenResult.token) {
        try {
          const children = await listFolderChildren(
            tokenResult.token,
            reportMapsFolderId,
            { filesOnly: true },
          );
          const hit = children.find(
            (f) => f.name.toLowerCase() === "neighborhood.png",
          );
          if (hit) {
            hasMapImage = true;
            mapImageFileId = hit.id;
          }
        } catch (e) {
          if (e instanceof DriveAuthError) throw e;
          console.warn("[neighborhood-borrow] drive list failed", e);
        }
      }
    }

    const payload: NeighborhoodBorrowGetResponse = {
      boundaries,
      narrative,
      mapData,
      hasMapImage,
      mapImageFileId,
    };

    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof DriveAuthError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 401 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[neighborhood-borrow]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface PostBody {
  sourceProjectId?: string;
  targetProjectId?: string;
}

/**
 * POST /api/neighborhood/borrow — copy neighborhood.png between Drive folders
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PostBody;
    const sourceProjectId = body.sourceProjectId?.trim() ?? "";
    const targetProjectId = body.targetProjectId?.trim() ?? "";

    if (!sourceProjectId || !targetProjectId) {
      return NextResponse.json(
        { error: "sourceProjectId and targetProjectId are required" },
        { status: 400 },
      );
    }
    if (sourceProjectId === targetProjectId) {
      return NextResponse.json(
        { error: "Source and target must differ" },
        { status: 400 },
      );
    }

    const tokenResult = await getGoogleToken();
    if (!tokenResult.token) {
      return NextResponse.json(
        {
          error: tokenResult.error ?? "Google Drive authentication required",
          code: tokenResult.code,
        },
        { status: 401 },
      );
    }
    const token = tokenResult.token;

    const supabase = await createClient();

    const { data: rows, error } = await supabase
      .from("projects")
      .select("id, folder_structure")
      .in("id", [sourceProjectId, targetProjectId]);

    if (error) {
      console.error("[neighborhood-borrow POST]", error.message);
      return NextResponse.json(
        { error: "Failed to load projects" },
        { status: 500 },
      );
    }

    const byId = new Map(
      (rows ?? []).map((r) => [
        r.id as string,
        parseFolderStructure(
          r.folder_structure as Record<string, unknown> | null,
        ),
      ]),
    );

    const sourceFs = byId.get(sourceProjectId);
    const targetFs = byId.get(targetProjectId);
    if (!sourceFs || !byId.has(sourceProjectId)) {
      return NextResponse.json({ error: "Source project not found" }, { status: 404 });
    }
    if (!targetFs || !byId.has(targetProjectId)) {
      return NextResponse.json({ error: "Target project not found" }, { status: 404 });
    }

    const sourceFolderId = sourceFs.reportMapsFolderId?.trim();
    const targetFolderId = targetFs.reportMapsFolderId?.trim();
    if (!sourceFolderId) {
      return NextResponse.json(
        { error: "Source project has no report maps folder" },
        { status: 400 },
      );
    }
    if (!targetFolderId) {
      return NextResponse.json(
        { error: "Target project has no report maps folder" },
        { status: 400 },
      );
    }

    const children = await listFolderChildren(token, sourceFolderId, {
      filesOnly: true,
    });
    const fileMeta = children.find(
      (f) => f.name.toLowerCase() === "neighborhood.png",
    );
    if (!fileMeta) {
      return NextResponse.json(
        { error: "neighborhood.png not found in source project" },
        { status: 404 },
      );
    }

    const buffer = await downloadFile(token, fileMeta.id);
    const mime = fileMeta.mimeType?.startsWith("image/")
      ? fileMeta.mimeType
      : "image/png";

    await uploadOrUpdateFile(
      token,
      targetFolderId,
      "neighborhood.png",
      buffer,
      mime,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof DriveAuthError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 401 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[neighborhood-borrow POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
