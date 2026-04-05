import "server-only";

import { NextResponse } from "next/server";
import { normalizeAddress } from "~/lib/comp-matcher";
import {
  compLocationMapId,
  normalizeProjectData,
  type Comparable,
  type ProjectData,
} from "~/utils/projectStore";
import { createClient, createServiceClient } from "~/utils/supabase/server";

const TAG = "[import-legacy-json]";

interface ImportLegacyBody {
  projectId?: string;
  legacyJson?: Record<string, unknown>;
}

interface CompMatchEntry {
  dbId: string;
  addressForDisplay: string;
  matchType: "folder_id" | "address";
}

type SupabaseSeed = ReturnType<typeof createServiceClient>;

async function importMapsAndMarkers(
  supabase: SupabaseSeed,
  projectId: string,
  projectData: ProjectData,
): Promise<{ maps: number; markers: number }> {
  let markerTotal = 0;

  for (const mapView of projectData.maps) {
    const { error: mapError } = await supabase.from("maps").upsert({
      id: mapView.id,
      project_id: projectId,
      type: mapView.type,
      linked_comp_id: mapView.linkedCompId ?? null,
      map_center: mapView.mapCenter,
      map_zoom: mapView.mapZoom,
      bubble_size: mapView.bubbleSize,
      hide_ui: mapView.hideUI,
      document_frame_size: mapView.documentFrameSize,
      drawings: mapView.drawings,
    });
    if (mapError) {
      throw new Error(`Map upsert failed (${mapView.id}): ${mapError.message}`);
    }

    markerTotal += mapView.markers.length;

    if (mapView.markers.length > 0) {
      const markerRows = mapView.markers.map((mk) => ({
        id: mk.id,
        map_id: mk.mapId,
        comp_id: mk.compId ?? null,
        marker_position: mk.markerPosition,
        bubble_position: mk.bubblePosition,
        is_tail_pinned: mk.isTailPinned,
        pinned_tail_tip_position: mk.pinnedTailTipPosition,
      }));

      const { error: markerError } = await supabase
        .from("map_markers")
        .upsert(markerRows);
      if (markerError) {
        throw new Error(
          `Map markers upsert failed (map ${mapView.id}): ${markerError.message}`,
        );
      }
    }
  }

  return { maps: projectData.maps.length, markers: markerTotal };
}

function buildCompIdMap(
  legacyComparables: Comparable[],
  dbRows: { id: string; address: string; folder_id: string | null }[],
): {
  compIdMap: Map<string, CompMatchEntry>;
  unmatchedLegacyComps: string[];
} {
  const usedDbIds = new Set<string>();
  const compIdMap = new Map<string, CompMatchEntry>();
  const unmatchedLegacyComps: string[] = [];

  for (const legacy of legacyComparables) {
    const legacyFolder = (legacy.folderId ?? "").trim();
    let matchRow:
      | { id: string; address: string; folder_id: string | null }
      | undefined;
    let matchType: "folder_id" | "address" | undefined;

    if (legacyFolder !== "") {
      matchRow = dbRows.find((r) => {
        const dbFolder = (r.folder_id ?? "").trim();
        return (
          dbFolder !== "" &&
          dbFolder === legacyFolder &&
          !usedDbIds.has(r.id)
        );
      });
      if (matchRow) {
        matchType = "folder_id";
      }
    }

    if (!matchRow) {
      const normLegacy = normalizeAddress(legacy.address);
      if (normLegacy !== "") {
        matchRow = dbRows.find((r) => {
          return (
            !usedDbIds.has(r.id) &&
            normalizeAddress(r.address) === normLegacy
          );
        });
        if (matchRow) {
          matchType = "address";
        }
      }
    }

    if (matchRow && matchType) {
      usedDbIds.add(matchRow.id);
      compIdMap.set(legacy.id, {
        dbId: matchRow.id,
        addressForDisplay: legacy.addressForDisplay,
        matchType,
      });
    } else {
      unmatchedLegacyComps.push(
        legacy.addressForDisplay.trim() !== ""
          ? legacy.addressForDisplay
          : legacy.address,
      );
    }
  }

  return { compIdMap, unmatchedLegacyComps };
}

function remapCompIdsInProjectData(
  projectData: ProjectData,
  compIdMap: Map<string, CompMatchEntry>,
): void {
  for (const map of projectData.maps) {
    const isCompLocation = map.type === "comp-location";
    let mapId = map.id;

    if (
      isCompLocation &&
      map.linkedCompId &&
      compIdMap.has(map.linkedCompId)
    ) {
      const { dbId } = compIdMap.get(map.linkedCompId)!;
      map.linkedCompId = dbId;
      mapId = compLocationMapId(dbId);
      map.id = mapId;
    } else if (map.linkedCompId && !compIdMap.has(map.linkedCompId)) {
      map.linkedCompId = undefined;
    }

    let orphanIdx = 0;
    for (const marker of map.markers) {
      marker.mapId = mapId;

      if (marker.compId && compIdMap.has(marker.compId)) {
        const newCid = compIdMap.get(marker.compId)!.dbId;
        marker.compId = newCid;
        marker.id = `marker-${newCid}-${mapId}`;
      } else if (marker.compId) {
        marker.compId = undefined;
        marker.id = `marker-legacy-${mapId}-${orphanIdx}`;
        orphanIdx += 1;
      } else if (marker.id.startsWith("marker-subject-")) {
        marker.id = `marker-subject-${mapId}`;
      } else {
        marker.id = `marker-nocomp-${mapId}-${orphanIdx}`;
        orphanIdx += 1;
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    let body: ImportLegacyBody;
    try {
      body = (await request.json()) as ImportLegacyBody;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const projectId =
      typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 },
      );
    }

    const legacyJson = body.legacyJson;
    if (!legacyJson || typeof legacyJson !== "object" || Array.isArray(legacyJson)) {
      return NextResponse.json(
        { error: "legacyJson must be a non-array object" },
        { status: 400 },
      );
    }

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json(
        { error: projectError.message },
        { status: 500 },
      );
    }
    if (!projectRow) {
      return NextResponse.json(
        { error: `Project not found: ${projectId}` },
        { status: 404 },
      );
    }

    const projectData = normalizeProjectData(legacyJson);

    const { data: dbComps, error: compsError } = await supabase
      .from("comparables")
      .select("id, address, folder_id")
      .eq("project_id", projectId);

    if (compsError) {
      return NextResponse.json(
        { error: compsError.message },
        { status: 500 },
      );
    }

    const { compIdMap, unmatchedLegacyComps } = buildCompIdMap(
      projectData.comparables,
      (dbComps ?? []) as { id: string; address: string; folder_id: string | null }[],
    );

    remapCompIdsInProjectData(projectData, compIdMap);

    const { maps, markers } = await importMapsAndMarkers(
      supabase,
      projectId,
      projectData,
    );

    let compsDisplayUpdated = 0;
    for (const [, entry] of compIdMap) {
      const { error: updErr } = await supabase
        .from("comparables")
        .update({ address_for_display: entry.addressForDisplay })
        .eq("id", entry.dbId);
      if (updErr) {
        return NextResponse.json(
          { error: `address_for_display update failed (${entry.dbId}): ${updErr.message}` },
          { status: 500 },
        );
      }
      compsDisplayUpdated += 1;
    }

    const compMatches = Array.from(compIdMap.entries()).map(
      ([legacyId, v]) => ({
        legacyId,
        dbId: v.dbId,
        matchType: v.matchType,
      }),
    );

    console.log(
      `${TAG} POST project=${projectId}: ${maps} maps, ${markers} markers, ${compsDisplayUpdated} display updates, ${unmatchedLegacyComps.length} unmatched legacy comps`,
    );

    return NextResponse.json({
      maps,
      markers,
      compsDisplayUpdated,
      compMatches,
      unmatchedLegacyComps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    console.error(`${TAG} POST`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
