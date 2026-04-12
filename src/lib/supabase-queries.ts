import type {
  PostgrestError,
  PostgrestResponse,
  PostgrestSingleResponse,
} from "@supabase/supabase-js";
import { format } from "date-fns";
import { createClient } from "~/utils/supabase/client";
import {
  normalizeProjectApproaches,
  type ProjectData,
  type ProjectFolderStructure,
  type ProjectApproaches,
  type Comparable,
  type MapView,
  type MapMarker,
  type MapDrawings,
  type LatLng,
} from "~/utils/projectStore";
import { parseEngagementDateToDate } from "~/utils/parse-engagement-date";

/** Normalise any recognised date string to YYYY-MM-DD for a Postgres date column. */
function normalizeDateForDb(v: string | null | undefined): string | null {
  if (!v?.trim()) return null;
  const d = parseEngagementDateToDate(v);
  return d ? format(d, "yyyy-MM-dd") : null;
}

function parseFolderStructure(
  raw: Record<string, unknown> | null | undefined,
): ProjectFolderStructure | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return raw as ProjectFolderStructure;
}

// ============================================================
// DB Row types (snake_case, matching Supabase schema)
// ============================================================

interface ProjectRow {
  id: string;
  name: string;
  client_company: string | null;
  client_name: string | null;
  property_type: string | null;
  project_folder_id: string | null;
  folder_structure: Record<string, unknown> | null;
  effective_date: string | null;
  report_due_date: string | null;
  exposure_time: string | null;
  highest_best_use: string | null;
  insurance_price_per_sf: number | string | null;
  vacancy_rate: number | string | null;
  percent_inc_per_month: number | string | null;
  approaches: unknown;
  created_at: string;
  updated_at: string;
}

function numericField(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

interface ProjectListRow {
  id: string;
  name: string;
  property_type: string | null;
  client_company: string | null;
  effective_date: string | null;
  report_due_date: string | null;
  updated_at: string;
  // Supabase returns a single object (not array) for unique-FK one-to-one relationships.
  // Type as union so we handle both the runtime shape and older data gracefully.
  subject_data:
    | { core: Record<string, unknown> }
    | { core: Record<string, unknown> }[]
    | null;
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
  parsed_data_status?: string | null;
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
  image_file_id: string | null;
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
  const rawStatus = row.parsed_data_status;
  const parsedDataStatus =
    rawStatus === "none" ||
    rawStatus === "processing" ||
    rawStatus === "parsed" ||
    rawStatus === "error" ||
    rawStatus === "reparsing" ||
    rawStatus === "pending_review"
      ? rawStatus
      : undefined;

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
    parsedDataStatus,
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
    imageFileId: row.image_file_id ?? undefined,
  };
}

// ============================================================
// Fetch operations
// ============================================================

export interface ProjectListItem {
  id: string;
  name: string;
  address?: string;
  city?: string;
  propertyType?: string;
  clientCompany?: string;
  effectiveDate?: string;
  reportDueDate?: string;
  updatedAt: string;
}

export interface FetchProjectsListOptions {
  /** When true, include rows with `is_reference = true` (e.g. Reference Library). Default false. */
  includeReferenceProjects?: boolean;
}

export async function fetchProjectsList(
  options?: FetchProjectsListOptions,
): Promise<ProjectListItem[]> {
  const supabase = createClient();
  let q = supabase
    .from("projects")
    .select(
      "id, name, property_type, client_company, effective_date, report_due_date, updated_at, subject_data(core)",
    )
    .is("archived_at", null);

  if (options?.includeReferenceProjects !== true) {
    q = q.or("is_reference.is.null,is_reference.eq.false");
  }

  const listResult = (await q.order("updated_at", {
    ascending: false,
  })) as PostgrestResponse<ProjectListRow>;

  if (listResult.error) throw listResult.error;

  return (listResult.data ?? []).map((row) => {
    // subject_data is one-to-one (unique FK) — Supabase returns an object, not an array.
    // Guard for both shapes in case the runtime ever differs.
    const sd = row.subject_data;
    const core: Record<string, unknown> | undefined = sd == null
      ? undefined
      : Array.isArray(sd)
        ? sd[0]?.core
        : sd.core;
    const addr = core && typeof core === "object" ? core.Address : undefined;
    const address = typeof addr === "string" && addr.trim() ? addr.trim() : undefined;
    const cityRaw = core && typeof core === "object" ? core.City : undefined;
    const city = typeof cityRaw === "string" ? cityRaw : undefined;
    return {
      id: row.id,
      name: row.name,
      address: address ?? undefined,
      city: city?.trim() ? city.trim() : undefined,
      propertyType: row.property_type ?? undefined,
      clientCompany: row.client_company ?? undefined,
      effectiveDate: row.effective_date ?? undefined,
      reportDueDate: row.report_due_date ?? undefined,
      updatedAt: row.updated_at,
    };
  });
}

export async function fetchProject(
  projectId: string,
): Promise<{ project: ProjectData; name: string } | null> {
  const supabase = createClient();

  const [projectRes, compsRes, mapsRes, subjectRes] = (await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("comparables").select("*").eq("project_id", projectId),
    supabase.from("maps").select("*").eq("project_id", projectId),
    supabase.from("subject_data").select("core").eq("project_id", projectId).maybeSingle(),
  ])) as [
    PostgrestSingleResponse<ProjectRow>,
    PostgrestResponse<ComparableRow>,
    PostgrestResponse<MapRow>,
    PostgrestSingleResponse<{ core: Record<string, unknown> } | null>,
  ];

  if (projectRes.error || !projectRes.data) return null;

  const mapRows = mapsRes.data ?? [];
  const mapIds = mapRows.map((m) => m.id);

  let markerRows: MapMarkerRow[] = [];
  if (mapIds.length > 0) {
    const markersRes = (await supabase
      .from("map_markers")
      .select("*")
      .in("map_id", mapIds)) as PostgrestResponse<MapMarkerRow>;
    markerRows = markersRes.data ?? [];
  }

  const projectRow = projectRes.data;
  const compRows = compsRes.data ?? [];

  const markersByMapId = new Map<string, MapMarker[]>();
  for (const row of markerRows) {
    const marker = markerFromRow(row);
    const existing = markersByMapId.get(row.map_id) ?? [];
    existing.push(marker);
    markersByMapId.set(row.map_id, existing);
  }

  const folderStructure = parseFolderStructure(projectRow.folder_structure);
  const subjectCore: Record<string, unknown> = {
    ...(subjectRes.data?.core ?? {}),
  };

  const landAcRaw = subjectCore["Land Size (AC)"];
  const acres =
    landAcRaw == null
      ? undefined
      : typeof landAcRaw === "string" || typeof landAcRaw === "number"
        ? String(landAcRaw)
        : undefined;

  const project: ProjectData = {
    subject: {
      address: typeof subjectCore.Address === "string" ? subjectCore.Address : "",
      addressForDisplay: typeof subjectCore.AddressLocal === "string"
        ? subjectCore.AddressLocal
        : typeof subjectCore.Address === "string" ? subjectCore.Address : "",
      legalDescription: typeof subjectCore.Legal === "string" ? subjectCore.Legal : undefined,
      acres,
    },
    comparables: compRows.map(comparableFromRow),
    maps: mapRows.map((m) =>
      mapViewFromRow(m, markersByMapId.get(m.id) ?? []),
    ),
    projectFolderId: projectRow.project_folder_id ?? undefined,
    clientCompany: projectRow.client_company ?? undefined,
    clientName: projectRow.client_name ?? undefined,
    propertyType: projectRow.property_type ?? undefined,
    folderStructure,
    effectiveDate: projectRow.effective_date ?? undefined,
    reportDueDate: projectRow.report_due_date ?? undefined,
    exposureTime: projectRow.exposure_time ?? undefined,
    highestBestUse: projectRow.highest_best_use ?? undefined,
    insurancePricePerSf: numericField(projectRow.insurance_price_per_sf),
    vacancyRate: numericField(projectRow.vacancy_rate),
    percentIncPerMonth: numericField(projectRow.percent_inc_per_month),
    approaches: normalizeProjectApproaches(projectRow.approaches),
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

  const insertResult = (await supabase
    .from("projects")
    .insert({
      name,
      client_company: project.clientCompany ?? null,
      client_name: project.clientName ?? null,
      property_type: project.propertyType ?? null,
      project_folder_id: project.projectFolderId ?? null,
    })
    .select("id")
    .single()) as unknown as PostgrestSingleResponse<{ id: string }>;

  if (insertResult.error) throw insertResult.error;
  if (!insertResult.data) {
    throw new Error("Insert project returned no row");
  }
  const projectId = insertResult.data.id;

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
    parsed_data_status: c.parsedDataStatus ?? "none",
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

/** Only include keys you intend to change — supports explicit null to clear a column. */
export type ProjectMetadataPatch = Partial<{
  name: string;
  clientCompany: string | null;
  clientName: string | null;
  propertyType: string | null;
  projectFolderId: string | null;
  effectiveDate: string | null;
  reportDueDate: string | null;
  exposureTime: string | null;
  highestBestUse: string | null;
  insurancePricePerSf: number | null;
  vacancyRate: number | null;
  percentIncPerMonth: number | null;
  approaches: ProjectApproaches | null;
}>;

export async function upsertProjectMetadata(
  projectId: string,
  data: ProjectMetadataPatch,
) {
  const supabase = createClient();

  const updates: Record<string, unknown> = {};
  if ("name" in data && data.name !== undefined) updates.name = data.name;
  if ("clientCompany" in data) {
    const v = data.clientCompany;
    updates.client_company =
      v != null && v.trim() !== "" ? v : null;
  }
  if ("clientName" in data) {
    const v = data.clientName;
    updates.client_name = v != null && v.trim() !== "" ? v : null;
  }
  if ("propertyType" in data) {
    const v = data.propertyType;
    updates.property_type = v != null && v.trim() !== "" ? v : null;
  }
  if ("projectFolderId" in data) {
    const v = data.projectFolderId;
    updates.project_folder_id =
      v != null && v.trim() !== "" ? v : null;
  }
  if ("effectiveDate" in data) {
    updates.effective_date = normalizeDateForDb(data.effectiveDate);
  }
  if ("reportDueDate" in data) {
    updates.report_due_date = normalizeDateForDb(data.reportDueDate);
  }
  if ("exposureTime" in data) {
    const v = data.exposureTime;
    updates.exposure_time = v != null && v.trim() !== "" ? v : null;
  }
  if ("highestBestUse" in data) {
    const v = data.highestBestUse;
    updates.highest_best_use = v != null && v.trim() !== "" ? v : null;
  }
  if ("insurancePricePerSf" in data)
    updates.insurance_price_per_sf = data.insurancePricePerSf;
  if ("vacancyRate" in data) updates.vacancy_rate = data.vacancyRate;
  if ("percentIncPerMonth" in data)
    updates.percent_inc_per_month = data.percentIncPerMonth;
  if ("approaches" in data) updates.approaches = data.approaches;

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
    parsed_data_status: comp.parsedDataStatus ?? "none",
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
    image_file_id: mapView.imageFileId ?? null,
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

export async function archiveProject(projectId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("projects")
    .update({ archived_at: new Date().toISOString() })
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

  const existingResult = await supabase
    .from("page_locks")
    .select("locked_by, locked_at")
    .eq("project_id", projectId)
    .eq("page_key", pageKey)
    .single();

  const existing = existingResult.data as {
    locked_by: string;
    locked_at: string;
  } | null;

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
  const photosResult = (await supabase
    .from("photo_analyses")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_included", true)
    .order("sort_order", { ascending: true })) as PostgrestResponse<PhotoAnalysisRow>;

  if (photosResult.error) throw photosResult.error;
  return (photosResult.data ?? []).map(photoFromRow);
}

export async function fetchArchivedPhotos(
  projectId: string,
): Promise<PhotoAnalysis[]> {
  const supabase = createClient();
  const photosResult = (await supabase
    .from("photo_analyses")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_included", false)
    .order("sort_order", { ascending: true })) as PostgrestResponse<PhotoAnalysisRow>;

  if (photosResult.error) throw photosResult.error;
  return (photosResult.data ?? []).map(photoFromRow);
}

export async function updatePhotoLabel(photoId: string, label: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("photo_analyses")
    .update({ label })
    .eq("id", photoId);
  if (error) throw error;
}

export async function updatePhotoCategory(photoId: string, category: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("photo_analyses")
    .update({ category })
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
  const exportResult = (await supabase
    .from("photo_analyses")
    .select("file_name, label")
    .eq("project_id", projectId)
    .eq("is_included", true)
    .order("sort_order", { ascending: true })) as PostgrestResponse<{
    file_name: string;
    label: string;
  }>;

  if (exportResult.error) throw exportResult.error;

  return (exportResult.data ?? []).map((row) => ({
    image: row.file_name,
    label: row.label,
  }));
}

/**
 * Fetches and aggregates improvements_observed across all included photos for a project.
 * Returns a flat map of first-non-empty value per improvement key.
 * This is a lightweight query (no image data, labels, or descriptions) for use
 * by the improvement analysis page to populate its grid without loading full photo rows.
 */
export async function fetchAggregatedPhotoImprovements(
  projectId: string,
): Promise<Record<string, string>> {
  const supabase = createClient();
  const result = (await supabase
    .from("photo_analyses")
    .select("improvements_observed")
    .eq("project_id", projectId)
    .eq("is_included", true)
    .order("sort_order", { ascending: true })) as PostgrestResponse<{
    improvements_observed: Record<string, string> | null;
  }>;

  if (result.error) throw result.error;

  const aggregated: Record<string, string> = {};
  for (const row of result.data ?? []) {
    const obs = row.improvements_observed;
    if (!obs || typeof obs !== "object") continue;
    for (const [key, value] of Object.entries(obs)) {
      if (value && typeof value === "string" && value.trim() && !(key in aggregated)) {
        aggregated[key] = value.trim();
      }
    }
  }
  return aggregated;
}

/**
 * Fetches all included photos for a project that have a non-null/non-empty value
 * for a given improvements_observed key. Used by the reference image panel to
 * show which photos contributed to an auto-populated improvement field.
 */
export async function fetchPhotosForImprovementKey(
  projectId: string,
  improvementKey: string,
): Promise<PhotoAnalysis[]> {
  const supabase = createClient();
  const result = (await supabase
    .from("photo_analyses")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_included", true)
    .not(`improvements_observed->>${improvementKey}`, "is", null)
    .neq(`improvements_observed->>${improvementKey}`, "")
    .order("sort_order", { ascending: true })) as PostgrestResponse<PhotoAnalysisRow>;

  if (result.error) throw result.error;
  return (result.data ?? []).map(photoFromRow);
}

interface ReportSectionRow {
  id: string;
  project_id: string;
  section_key: string;
  content: string;
  version: number;
  generation_context: Record<string, unknown>;
  property_type: string | null;
  city: string | null;
  county: string | null;
  subject_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportSection {
  id: string;
  projectId: string;
  sectionKey: string;
  content: string;
  version: number;
  generationContext: Record<string, unknown>;
  propertyType: string | null;
  city: string | null;
  county: string | null;
  subjectAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

function reportSectionFromRow(row: ReportSectionRow): ReportSection {
  return {
    id: row.id,
    projectId: row.project_id,
    sectionKey: row.section_key,
    content: row.content,
    version: row.version,
    generationContext: row.generation_context ?? {},
    propertyType: row.property_type,
    city: row.city,
    county: row.county,
    subjectAddress: row.subject_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchReportSection(
  projectId: string,
  sectionKey: string,
): Promise<ReportSection | null> {
  const supabase = createClient();
  const sectionResult = await supabase
    .from("report_sections")
    .select("*")
    .eq("project_id", projectId)
    .eq("section_key", sectionKey)
    .single();

  if (sectionResult.error && sectionResult.error.code !== "PGRST116") {
    throw sectionResult.error;
  }
  if (!sectionResult.data) return null;
  return reportSectionFromRow(sectionResult.data as ReportSectionRow);
}

export async function fetchAllReportSections(
  projectId: string,
): Promise<ReportSection[]> {
  const supabase = createClient();
  const allResult = (await supabase
    .from("report_sections")
    .select("*")
    .eq("project_id", projectId)
    .order("section_key")) as PostgrestResponse<ReportSectionRow>;

  if (allResult.error) throw allResult.error;
  return (allResult.data ?? []).map(reportSectionFromRow);
}

export async function upsertReportSection(
  projectId: string,
  sectionKey: string,
  content: string,
  generationContext?: Record<string, unknown>,
): Promise<ReportSection> {
  const supabase = createClient();

  const existingResult = await supabase
    .from("report_sections")
    .select("id, content, version, generation_context")
    .eq("project_id", projectId)
    .eq("section_key", sectionKey)
    .single();

  const existingRow = existingResult.data as {
    id: string;
    content: string;
    version: number;
    generation_context: Record<string, unknown>;
  } | null;

  if (existingRow) {
    await supabase.from("report_section_history").insert({
      report_section_id: existingRow.id,
      content: existingRow.content,
      version: existingRow.version,
      generation_context: existingRow.generation_context ?? {},
    });

    const updateResult = await supabase
      .from("report_sections")
      .update({
        content,
        version: existingRow.version + 1,
        generation_context: generationContext ?? {},
      })
      .eq("id", existingRow.id)
      .select("*")
      .single();

    if (updateResult.error) throw updateResult.error;
    if (!updateResult.data) {
      throw new Error("Update report section returned no row");
    }
    return reportSectionFromRow(updateResult.data as ReportSectionRow);
  }

  const insertSectionResult = await supabase
    .from("report_sections")
    .insert({
      project_id: projectId,
      section_key: sectionKey,
      content,
      version: 1,
      generation_context: generationContext ?? {},
    })
    .select("*")
    .single();

  if (insertSectionResult.error) throw insertSectionResult.error;
  if (!insertSectionResult.data) {
    throw new Error("Insert report section returned no row");
  }
  return reportSectionFromRow(insertSectionResult.data as ReportSectionRow);
}

export type RealtimeReportSectionPayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: ReportSection | null;
  old: { id: string } | null;
};

export function subscribeToReportSections(
  projectId: string,
  callback: (payload: RealtimeReportSectionPayload) => void,
) {
  const supabase = createClient();
  const channel = supabase
    .channel(`report-sections:${projectId}`)
    .on(
      "postgres_changes" as never,
      {
        event: "*",
        schema: "public",
        table: "report_sections",
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
            ? reportSectionFromRow(
                payload.new as unknown as ReportSectionRow,
              )
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

// ============================================================
// Project documents (context store)
// ============================================================

interface ProjectDocumentRow {
  id: string;
  project_id: string;
  document_type: string;
  document_label: string | null;
  file_id: string | null;
  file_name: string | null;
  mime_type: string | null;
  extracted_text: string | null;
  structured_data: Record<string, unknown>;
  processed_at: string | null;
  section_tag: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  documentType: string;
  documentLabel: string | null;
  fileId: string | null;
  fileName: string | null;
  mimeType: string | null;
  extractedText: string | null;
  structuredData: Record<string, unknown>;
  processedAt: string | null;
  sectionTag: string | null;
  createdAt: string;
  updatedAt: string;
}

function projectDocumentFromRow(row: ProjectDocumentRow): ProjectDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    documentType: row.document_type,
    documentLabel: row.document_label,
    fileId: row.file_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    extractedText: row.extracted_text,
    structuredData: row.structured_data ?? {},
    processedAt: row.processed_at,
    sectionTag: row.section_tag,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchProjectDocuments(
  projectId: string,
): Promise<ProjectDocument[]> {
  const supabase = createClient();
  const docsResult = (await supabase
    .from("project_documents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })) as PostgrestResponse<ProjectDocumentRow>;

  if (docsResult.error) throw docsResult.error;
  return (docsResult.data ?? []).map(projectDocumentFromRow);
}

export async function fetchDocumentsByType(
  projectId: string,
  documentType: string,
): Promise<ProjectDocument[]> {
  const supabase = createClient();
  const docsResult = (await supabase
    .from("project_documents")
    .select("*")
    .eq("project_id", projectId)
    .eq("document_type", documentType)
    .order("created_at", { ascending: true })) as PostgrestResponse<ProjectDocumentRow>;

  if (docsResult.error) throw docsResult.error;
  return (docsResult.data ?? []).map(projectDocumentFromRow);
}

export async function fetchDocumentsBySectionTag(
  projectId: string,
  sectionTag: string,
): Promise<ProjectDocument[]> {
  const supabase = createClient();
  const docsResult = (await supabase
    .from("project_documents")
    .select("*")
    .eq("project_id", projectId)
    .eq("section_tag", sectionTag)
    .order("created_at", { ascending: true })) as PostgrestResponse<ProjectDocumentRow>;

  if (docsResult.error) throw docsResult.error;
  return (docsResult.data ?? []).map(projectDocumentFromRow);
}

export async function insertProjectDocument(
  projectId: string,
  doc: {
    documentType: string;
    documentLabel?: string;
    fileId?: string;
    fileName?: string;
    mimeType?: string;
    sectionTag?: string;
  },
): Promise<ProjectDocument> {
  const supabase = createClient();
  const insertDocResult = await supabase
    .from("project_documents")
    .insert({
      project_id: projectId,
      document_type: doc.documentType,
      document_label: doc.documentLabel ?? null,
      file_id: doc.fileId ?? null,
      file_name: doc.fileName ?? null,
      mime_type: doc.mimeType ?? null,
      section_tag: doc.sectionTag ?? null,
    })
    .select("*")
    .single();

  if (insertDocResult.error) throw insertDocResult.error;
  if (!insertDocResult.data) {
    throw new Error("Insert document returned no row");
  }
  return projectDocumentFromRow(insertDocResult.data as ProjectDocumentRow);
}

export async function updateDocumentProcessingResult(
  documentId: string,
  extractedText: string,
  structuredData: Record<string, unknown>,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("project_documents")
    .update({
      extracted_text: extractedText,
      structured_data: structuredData,
      processed_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) throw error;
}

export async function deleteProjectDocument(documentId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("project_documents")
    .delete()
    .eq("id", documentId);
  if (error) throw error;
}

export function subscribeToProjectDocuments(
  projectId: string,
  callback: (payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE";
    new: ProjectDocument | null;
    old: { id: string } | null;
  }) => void,
) {
  const supabase = createClient();
  const channel = supabase
    .channel(`documents:${projectId}`)
    .on(
      "postgres_changes" as never,
      {
        event: "*",
        schema: "public",
        table: "project_documents",
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
            ? projectDocumentFromRow(
                payload.new as unknown as ProjectDocumentRow,
              )
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

// ============================================================
// Knowledge base
// ============================================================

export interface KnowledgeBaseEntry {
  id: string;
  gemName: string;
  contentType: string;
  input: string | null;
  output: string;
  createdAt: string;
}

export async function fetchKnowledgeBase(
  gemName: string,
  contentType?: string,
): Promise<KnowledgeBaseEntry[]> {
  const supabase = createClient();
  let query = supabase
    .from("knowledge_base")
    .select("*")
    .eq("gem_name", gemName);

  if (contentType) {
    query = query.eq("content_type", contentType);
  }

  const kbResult = (await query.order(
    "created_at",
  )) as PostgrestResponse<{
    id: string;
    gem_name: string;
    content_type: string;
    input: string | null;
    output: string;
    created_at: string;
  }>;

  if (kbResult.error) throw kbResult.error;
  return (kbResult.data ?? []).map((row) => ({
    id: row.id,
    gemName: row.gem_name,
    contentType: row.content_type,
    input: row.input,
    output: row.output,
    createdAt: row.created_at,
  }));
}

export async function insertKnowledgeBaseEntry(entry: {
  gemName: string;
  contentType: string;
  input?: string;
  output: string;
}): Promise<void> {
  const supabase = createClient();
  const insertKbResult = (await supabase.from("knowledge_base").insert({
    gem_name: entry.gemName,
    content_type: entry.contentType,
    input: entry.input ?? null,
    output: entry.output,
  })) as { error: PostgrestError | null };
  if (insertKbResult.error) throw insertKbResult.error;
}

// ============================================================
// Vector similarity search (pgvector RPC functions)
// ============================================================

export interface SimilarReportSection {
  id: string;
  projectId: string;
  sectionKey: string;
  content: string;
  version: number;
  propertyType: string | null;
  city: string | null;
  county: string | null;
  subjectAddress: string | null;
  similarity: number;
}

export async function searchSimilarReportSections(
  embedding: number[],
  sectionKey?: string,
  limit = 5,
): Promise<SimilarReportSection[]> {
  const supabase = createClient();
  const rpcResult = (await supabase.rpc("search_similar_report_sections", {
    query_embedding: JSON.stringify(embedding),
    match_section_key: sectionKey ?? null,
    match_limit: limit,
    similarity_threshold: 0.3,
  })) as PostgrestResponse<{
    id: string;
    project_id: string;
    section_key: string;
    content: string;
    version: number;
    property_type: string | null;
    city: string | null;
    county: string | null;
    subject_address: string | null;
    similarity: number;
  }>;

  if (rpcResult.error) throw rpcResult.error;

  return (rpcResult.data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    sectionKey: row.section_key,
    content: row.content,
    version: row.version,
    propertyType: row.property_type,
    city: row.city,
    county: row.county,
    subjectAddress: row.subject_address,
    similarity: row.similarity,
  }));
}

export interface SimilarDocument {
  id: string;
  projectId: string;
  documentType: string;
  documentLabel: string | null;
  extractedText: string | null;
  structuredData: Record<string, unknown>;
  similarity: number;
}

export async function searchSimilarDocuments(
  embedding: number[],
  documentType?: string,
  limit = 5,
): Promise<SimilarDocument[]> {
  const supabase = createClient();
  const rpcResult = (await supabase.rpc("search_similar_documents", {
    query_embedding: JSON.stringify(embedding),
    match_document_type: documentType ?? null,
    match_limit: limit,
    similarity_threshold: 0.3,
  })) as PostgrestResponse<{
    id: string;
    project_id: string;
    document_type: string;
    document_label: string | null;
    extracted_text: string | null;
    structured_data: Record<string, unknown>;
    similarity: number;
  }>;

  if (rpcResult.error) throw rpcResult.error;

  return (rpcResult.data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    documentType: row.document_type,
    documentLabel: row.document_label,
    extractedText: row.extracted_text,
    structuredData: row.structured_data ?? {},
    similarity: row.similarity,
  }));
}

export interface SimilarKnowledge {
  id: string;
  gemName: string;
  contentType: string;
  input: string | null;
  output: string;
  similarity: number;
}

export async function searchSimilarKnowledge(
  embedding: number[],
  gemName?: string,
  contentType?: string,
  limit = 5,
): Promise<SimilarKnowledge[]> {
  const supabase = createClient();
  const rpcResult = (await supabase.rpc("search_similar_knowledge", {
    query_embedding: JSON.stringify(embedding),
    match_gem_name: gemName ?? null,
    match_content_type: contentType ?? null,
    match_limit: limit,
    similarity_threshold: 0.3,
  })) as PostgrestResponse<{
    id: string;
    gem_name: string;
    content_type: string;
    input: string | null;
    output: string;
    similarity: number;
  }>;

  if (rpcResult.error) throw rpcResult.error;

  return (rpcResult.data ?? []).map((row) => ({
    id: row.id,
    gemName: row.gem_name,
    contentType: row.content_type,
    input: row.input,
    output: row.output,
    similarity: row.similarity,
  }));
}
