import { createClient } from "~/utils/supabase/client";
import type {
  ProjectData,
  SubjectInfo,
  Comparable,
  MapView,
  MapMarker,
  MapDrawings,
  LatLng,
} from "~/utils/projectStore";

// ============================================================
// DB Row types (snake_case, matching Supabase schema)
// ============================================================

interface ProjectRow {
  id: string;
  name: string;
  client_company: string | null;
  client_name: string | null;
  property_type: string | null;
  subject_photos_folder_id: string | null;
  project_folder_id: string | null;
  subject: SubjectInfo;
  created_at: string;
  updated_at: string;
}

interface ComparableRow {
  id: string;
  project_id: string;
  type: string;
  number: string | null;
  address: string;
  address_for_display: string;
  apn: string[] | null;
  instrument_number: string | null;
  folder_id: string | null;
  images: Array<{
    id: string;
    name: string;
    webViewLink: string;
    webViewUrl: string;
    mimeType: string;
  }> | null;
}

interface MapRow {
  id: string;
  project_id: string;
  type: string;
  linked_comp_id: string | null;
  map_center: LatLng;
  map_zoom: number;
  bubble_size: number;
  hide_ui: boolean;
  document_frame_size: number;
  drawings: MapDrawings;
}

interface MapMarkerRow {
  id: string;
  map_id: string;
  comp_id: string | null;
  marker_position: LatLng | null;
  bubble_position: LatLng | null;
  is_tail_pinned: boolean;
  pinned_tail_tip_position: LatLng | null;
}

// ============================================================
// Row <-> Type converters
// ============================================================

function comparableFromRow(row: ComparableRow): Comparable {
  return {
    id: row.id,
    type: row.type as Comparable["type"],
    number: row.number ?? undefined,
    address: row.address,
    addressForDisplay: row.address_for_display,
    apn: row.apn && row.apn.length > 0 ? row.apn : undefined,
    instrumentNumber: row.instrument_number ?? undefined,
    folderId: row.folder_id ?? undefined,
    images: row.images ?? undefined,
  };
}

function markerFromRow(row: MapMarkerRow): MapMarker {
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

function mapViewFromRow(row: MapRow, markers: MapMarker[]): MapView {
  return {
    id: row.id,
    type: row.type as MapView["type"],
    linkedCompId: row.linked_comp_id ?? undefined,
    mapCenter: row.map_center,
    mapZoom: row.map_zoom,
    bubbleSize: row.bubble_size,
    hideUI: row.hide_ui,
    documentFrameSize: row.document_frame_size,
    drawings: row.drawings,
    markers,
  };
}

// ============================================================
// Fetch operations
// ============================================================

export interface ProjectListItem {
  id: string;
  name: string;
  subject: SubjectInfo;
  propertyType?: string;
  clientCompany?: string;
  updatedAt: string;
}

export async function fetchProjectsList(): Promise<ProjectListItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, subject, property_type, client_company, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as ProjectRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    subject: row.subject,
    propertyType: row.property_type ?? undefined,
    clientCompany: row.client_company ?? undefined,
    updatedAt: row.updated_at,
  }));
}

export async function fetchProject(
  projectId: string,
): Promise<{ project: ProjectData; name: string } | null> {
  const supabase = createClient();

  const [projectRes, compsRes, mapsRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("comparables").select("*").eq("project_id", projectId),
    supabase.from("maps").select("*").eq("project_id", projectId),
  ]);

  if (projectRes.error || !projectRes.data) return null;

  const mapRows = (mapsRes.data ?? []) as MapRow[];
  const mapIds = mapRows.map((m) => m.id);

  let markerRows: MapMarkerRow[] = [];
  if (mapIds.length > 0) {
    const markersRes = await supabase
      .from("map_markers")
      .select("*")
      .in("map_id", mapIds);
    markerRows = (markersRes.data ?? []) as MapMarkerRow[];
  }

  const projectRow = projectRes.data as ProjectRow;
  const compRows = (compsRes.data ?? []) as ComparableRow[];

  const markersByMapId = new Map<string, MapMarker[]>();
  for (const row of markerRows) {
    const marker = markerFromRow(row);
    const existing = markersByMapId.get(row.map_id) ?? [];
    existing.push(marker);
    markersByMapId.set(row.map_id, existing);
  }

  const project: ProjectData = {
    subject: projectRow.subject,
    comparables: compRows.map(comparableFromRow),
    maps: mapRows.map((m) =>
      mapViewFromRow(m, markersByMapId.get(m.id) ?? []),
    ),
    subjectPhotosFolderId: projectRow.subject_photos_folder_id ?? undefined,
    projectFolderId: projectRow.project_folder_id ?? undefined,
    clientCompany: projectRow.client_company ?? undefined,
    clientName: projectRow.client_name ?? undefined,
    propertyType: projectRow.property_type ?? undefined,
  };

  return { project, name: projectRow.name };
}

// ============================================================
// Create / Insert
// ============================================================

export async function insertProject(
  name: string,
  project: ProjectData,
): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      client_company: project.clientCompany ?? null,
      client_name: project.clientName ?? null,
      property_type: project.propertyType ?? null,
      subject_photos_folder_id: project.subjectPhotosFolderId ?? null,
      project_folder_id: project.projectFolderId ?? null,
      subject: project.subject,
    })
    .select("id")
    .single();

  if (error) throw error;
  const projectId = data.id as string;

  if (project.comparables.length > 0) {
    await batchInsertComparables(projectId, project.comparables);
  }

  if (project.maps.length > 0) {
    await batchInsertMaps(projectId, project.maps);
  }

  return projectId;
}

async function batchInsertComparables(
  projectId: string,
  comparables: Comparable[],
) {
  const supabase = createClient();
  const rows = comparables.map((c) => ({
    id: c.id,
    project_id: projectId,
    type: c.type,
    number: c.number ?? null,
    address: c.address,
    address_for_display: c.addressForDisplay,
    apn: c.apn ?? [],
    instrument_number: c.instrumentNumber ?? null,
    folder_id: c.folderId ?? null,
    images: c.images ?? [],
  }));

  const { error } = await supabase.from("comparables").upsert(rows);
  if (error) throw error;
}

async function batchInsertMaps(projectId: string, maps: MapView[]) {
  const supabase = createClient();

  const mapRows = maps.map((m) => ({
    id: m.id,
    project_id: projectId,
    type: m.type,
    linked_comp_id: m.linkedCompId ?? null,
    map_center: m.mapCenter,
    map_zoom: m.mapZoom,
    bubble_size: m.bubbleSize,
    hide_ui: m.hideUI,
    document_frame_size: m.documentFrameSize,
    drawings: m.drawings,
  }));

  const { error: mapError } = await supabase.from("maps").upsert(mapRows);
  if (mapError) throw mapError;

  const allMarkers = maps.flatMap((m) =>
    m.markers.map((mk) => ({
      id: mk.id,
      map_id: mk.mapId,
      comp_id: mk.compId ?? null,
      marker_position: mk.markerPosition,
      bubble_position: mk.bubblePosition,
      is_tail_pinned: mk.isTailPinned,
      pinned_tail_tip_position: mk.pinnedTailTipPosition,
    })),
  );

  if (allMarkers.length > 0) {
    const { error: markerError } = await supabase
      .from("map_markers")
      .upsert(allMarkers);
    if (markerError) throw markerError;
  }
}

// ============================================================
// Upsert operations (granular updates)
// ============================================================

export async function upsertProjectMetadata(
  projectId: string,
  data: {
    name?: string;
    subject?: SubjectInfo;
    clientCompany?: string;
    clientName?: string;
    propertyType?: string;
    subjectPhotosFolderId?: string;
    projectFolderId?: string;
  },
) {
  const supabase = createClient();

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.subject !== undefined) updates.subject = data.subject;
  if (data.clientCompany !== undefined)
    updates.client_company = data.clientCompany;
  if (data.clientName !== undefined) updates.client_name = data.clientName;
  if (data.propertyType !== undefined)
    updates.property_type = data.propertyType;
  if (data.subjectPhotosFolderId !== undefined)
    updates.subject_photos_folder_id = data.subjectPhotosFolderId;
  if (data.projectFolderId !== undefined)
    updates.project_folder_id = data.projectFolderId;

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", projectId);
  if (error) throw error;
}

export async function upsertComparable(
  projectId: string,
  comp: Comparable,
) {
  const supabase = createClient();
  const { error } = await supabase.from("comparables").upsert({
    id: comp.id,
    project_id: projectId,
    type: comp.type,
    number: comp.number ?? null,
    address: comp.address,
    address_for_display: comp.addressForDisplay,
    apn: comp.apn ?? [],
    instrument_number: comp.instrumentNumber ?? null,
    folder_id: comp.folderId ?? null,
    images: comp.images ?? [],
  });
  if (error) throw error;
}

export async function deleteComparable(compId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("comparables")
    .delete()
    .eq("id", compId);
  if (error) throw error;
}

export async function upsertMapView(
  projectId: string,
  mapView: MapView,
) {
  const supabase = createClient();

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
  if (mapError) throw mapError;

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
    if (markerError) throw markerError;
  }
}

export async function upsertMapViewport(
  mapId: string,
  viewport: { mapCenter: LatLng; mapZoom: number },
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("maps")
    .update({
      map_center: viewport.mapCenter,
      map_zoom: viewport.mapZoom,
    })
    .eq("id", mapId);
  if (error) throw error;
}

export async function upsertMapDrawings(
  mapId: string,
  drawings: MapDrawings,
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("maps")
    .update({ drawings })
    .eq("id", mapId);
  if (error) throw error;
}

export async function upsertMapSettings(
  mapId: string,
  settings: {
    bubbleSize?: number;
    hideUI?: boolean;
    documentFrameSize?: number;
  },
) {
  const supabase = createClient();
  const updates: Record<string, unknown> = {};
  if (settings.bubbleSize !== undefined)
    updates.bubble_size = settings.bubbleSize;
  if (settings.hideUI !== undefined) updates.hide_ui = settings.hideUI;
  if (settings.documentFrameSize !== undefined)
    updates.document_frame_size = settings.documentFrameSize;

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from("maps")
    .update(updates)
    .eq("id", mapId);
  if (error) throw error;
}

export async function upsertMapMarker(marker: MapMarker) {
  const supabase = createClient();
  const { error } = await supabase.from("map_markers").upsert({
    id: marker.id,
    map_id: marker.mapId,
    comp_id: marker.compId ?? null,
    marker_position: marker.markerPosition,
    bubble_position: marker.bubblePosition,
    is_tail_pinned: marker.isTailPinned,
    pinned_tail_tip_position: marker.pinnedTailTipPosition,
  });
  if (error) throw error;
}

export async function deleteMapMarker(markerId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("map_markers")
    .delete()
    .eq("id", markerId);
  if (error) throw error;
}

export async function deleteMap(mapId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("maps").delete().eq("id", mapId);
  if (error) throw error;
}

export async function deleteProject(projectId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);
  if (error) throw error;
}

// ============================================================
// Page locking
// ============================================================

export interface PageLock {
  projectId: string;
  pageKey: string;
  lockedBy: string;
  lockedAt: string;
}

export async function acquirePageLock(
  projectId: string,
  pageKey: string,
  userId: string,
): Promise<boolean> {
  const supabase = createClient();

  const { data: rawExisting } = await supabase
    .from("page_locks")
    .select("locked_by, locked_at")
    .eq("project_id", projectId)
    .eq("page_key", pageKey)
    .single();

  const existing = rawExisting as { locked_by: string; locked_at: string } | null;

  if (existing && existing.locked_by !== userId) {
    const lockedAt = new Date(existing.locked_at);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (lockedAt > fiveMinutesAgo) {
      return false;
    }
  }

  const { error } = await supabase.from("page_locks").upsert({
    project_id: projectId,
    page_key: pageKey,
    locked_by: userId,
    locked_at: new Date().toISOString(),
  });

  return !error;
}

export async function releasePageLock(
  projectId: string,
  pageKey: string,
  userId: string,
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("page_locks")
    .delete()
    .eq("project_id", projectId)
    .eq("page_key", pageKey)
    .eq("locked_by", userId);
  if (error) throw error;
}

export async function getPageLock(
  projectId: string,
  pageKey: string,
): Promise<PageLock | null> {
  const supabase = createClient();
  const result = await supabase
    .from("page_locks")
    .select("*")
    .eq("project_id", projectId)
    .eq("page_key", pageKey)
    .single();

  if (!result.data) return null;

  const row = result.data as {
    project_id: string;
    page_key: string;
    locked_by: string;
    locked_at: string;
  };

  return {
    projectId: row.project_id,
    pageKey: row.page_key,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
  };
}

// ============================================================
// Photo analyses (image knowledge base)
// ============================================================

interface PhotoAnalysisRow {
  id: string;
  project_id: string | null;
  file_name: string;
  file_id: string | null;
  category: string;
  label: string;
  description: string | null;
  improvements_observed: Record<string, string>;
  property_type: string | null;
  subject_address: string | null;
  project_folder_id: string | null;
  sort_order: number;
  is_included: boolean;
  created_at: string;
  updated_at: string;
}

export interface PhotoAnalysis {
  id: string;
  projectId: string | null;
  fileName: string;
  fileId: string | null;
  category: string;
  label: string;
  description: string | null;
  improvementsObserved: Record<string, string>;
  propertyType: string | null;
  subjectAddress: string | null;
  projectFolderId: string | null;
  sortOrder: number;
  isIncluded: boolean;
  createdAt: string;
  updatedAt: string;
}

function photoFromRow(row: PhotoAnalysisRow): PhotoAnalysis {
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    fileId: row.file_id,
    category: row.category,
    label: row.label,
    description: row.description,
    improvementsObserved: row.improvements_observed ?? {},
    propertyType: row.property_type,
    subjectAddress: row.subject_address,
    projectFolderId: row.project_folder_id,
    sortOrder: row.sort_order,
    isIncluded: row.is_included,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchProjectPhotos(
  projectId: string,
): Promise<PhotoAnalysis[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("photo_analyses")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_included", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as PhotoAnalysisRow[]).map(photoFromRow);
}

export async function fetchArchivedPhotos(
  projectId: string,
): Promise<PhotoAnalysis[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("photo_analyses")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_included", false)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as PhotoAnalysisRow[]).map(photoFromRow);
}

export async function updatePhotoLabel(photoId: string, label: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("photo_analyses")
    .update({ label })
    .eq("id", photoId);
  if (error) throw error;
}

export async function updatePhotoSortOrder(
  photos: { id: string; sortOrder: number }[],
) {
  const supabase = createClient();
  const updates = photos.map((p) =>
    supabase
      .from("photo_analyses")
      .update({ sort_order: p.sortOrder })
      .eq("id", p.id),
  );
  const results = await Promise.all(updates);
  for (const result of results) {
    if (result.error) throw result.error;
  }
}

export async function archivePhoto(photoId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("photo_analyses")
    .update({ is_included: false })
    .eq("id", photoId);
  if (error) throw error;
}

export async function restorePhoto(photoId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("photo_analyses")
    .update({ is_included: true })
    .eq("id", photoId);
  if (error) throw error;
}

export type RealtimePhotoPayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: PhotoAnalysis | null;
  old: { id: string } | null;
};

export function subscribeToProjectPhotos(
  projectId: string,
  callback: (payload: RealtimePhotoPayload) => void,
) {
  const supabase = createClient();
  const channel = supabase
    .channel(`photos:${projectId}`)
    .on(
      "postgres_changes" as never,
      {
        event: "*",
        schema: "public",
        table: "photo_analyses",
        filter: `project_id=eq.${projectId}`,
      },
      (payload: {
        eventType: "INSERT" | "UPDATE" | "DELETE";
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      }) => {
        callback({
          eventType: payload.eventType,
          new: payload.new?.id
            ? photoFromRow(payload.new as unknown as PhotoAnalysisRow)
            : null,
          old: payload.old?.id
            ? { id: payload.old.id as string }
            : null,
        });
      },
    )
    .subscribe();

  return channel;
}

export async function fetchIncludedPhotosForExport(
  projectId: string,
): Promise<{ image: string; label: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("photo_analyses")
    .select("file_name, label")
    .eq("project_id", projectId)
    .eq("is_included", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as { file_name: string; label: string }[]).map(
    (row) => ({
      image: row.file_name,
      label: row.label,
    }),
  );
}
