import { sortComparables } from "~/utils/comparable-sort";

// ============================================================
// Core Primitive Types
// ============================================================

export type LatLng = { lat: number; lng: number };

export type ComparableType = "Land" | "Sales" | "Rentals";
export const COMPARABLE_TYPES: readonly ComparableType[] = [
  "Land",
  "Sales",
  "Rentals",
] as const;

export interface SubjectInfo {
  address: string;
  addressForDisplay?: string;
  legalDescription?: string;
  acres?: string;
}

export interface ImageData {
  id: string;
  name: string;
  webViewLink: string;
  webViewUrl: string;
  mimeType: string;
}

export type PolygonPath = LatLng;

export interface StreetLabelData {
  id: string;
  position: LatLng;
  text: string;
  rotation: number;
  isEditing?: boolean;
}

export interface Circle {
  center: LatLng;
  radius: number;
  id: string;
}

export interface Polyline {
  id: string;
  path: PolygonPath[];
}

// ============================================================
// New Entity Types (Supabase-ready normalized structure)
// ============================================================

export type MapType =
  | "subject-location"
  | "neighborhood"
  | "land-comps"
  | "sales-comps"
  | "rentals-comps"
  | "comp-location";

/** Property data for a comparable. No map visualization state. */
export type ComparableParsedDataStatus =
  | "none"
  | "processing"
  | "parsed"
  | "error";

export interface Comparable {
  id: string;
  type: ComparableType;
  number?: string;
  address: string;
  addressForDisplay: string;
  apn?: string[];
  instrumentNumber?: string;
  folderId?: string;
  images?: ImageData[];
  /** Synced from Supabase `comparables.parsed_data_status`. */
  parsedDataStatus?: ComparableParsedDataStatus;
}

/** Position of a subject or comparable on a specific map. */
export interface MapMarker {
  id: string;
  mapId: string;
  compId?: string;
  markerPosition: LatLng | null;
  bubblePosition: LatLng | null;
  isTailPinned: boolean;
  pinnedTailTipPosition: LatLng | null;
}

/** Drawing tools state for a map (polygons, circles, labels). */
export interface MapDrawings {
  polygonPath: LatLng[];
  circles: Circle[];
  polylines: Polyline[];
  streetLabels: StreetLabelData[];
  labelSize: number;
  circleRadius: 1 | 2 | 3 | 5;
  tailDirection: "left" | "right";
}

/** A map's viewport, drawings, and markers. One per "map page." */
export interface MapView {
  id: string;
  type: MapType;
  linkedCompId?: string;
  mapCenter: LatLng;
  mapZoom: number;
  bubbleSize: number;
  hideUI: boolean;
  documentFrameSize: number;
  drawings: MapDrawings;
  markers: MapMarker[];
  /** Google Drive file ID for the map banner preview image in reports/maps/. */
  imageFileId?: string;
}

// ============================================================
// ProjectData (normalized shape)
// ============================================================

/** Drive subfolder IDs discovered at project setup (JSONB on `projects`). */
export interface ProjectFolderStructure {
  subjectFolderId?: string;
  subjectPhotosFolderId?: string;
  subjectSketchesFolderId?: string;
  reportsFolderId?: string;
  reportMapsFolderId?: string;
  costReportFolderId?: string;
  engagementFolderId?: string;
  compsFolderIds?: {
    land?: string;
    sales?: string;
    rentals?: string;
  };
}

export interface ProjectApproaches {
  salesComparison: { land: boolean; sales: boolean };
  income: boolean;
  cost: boolean;
}

export const DEFAULT_APPROACHES: ProjectApproaches = {
  salesComparison: { land: true, sales: true },
  income: true,
  cost: true,
};

/** DB/client raw shape: any missing or non-false value enables the approach. */
export function normalizeProjectApproaches(raw?: unknown): ProjectApproaches {
  const rawApproaches = raw as Record<string, unknown> | null | undefined;
  const salesComp = (rawApproaches?.salesComparison ?? {}) as Record<
    string,
    unknown
  >;
  return {
    salesComparison: {
      land: salesComp.land !== false,
      sales: salesComp.sales !== false,
    },
    income: rawApproaches?.income !== false,
    cost: rawApproaches?.cost !== false,
  };
}

export interface ProjectData {
  /** Derived from subject_data.core at fetch time — NOT a DB column on projects. */
  subject: SubjectInfo;
  comparables: Comparable[];
  maps: MapView[];
  projectFolderId?: string;
  clientCompany?: string;
  clientName?: string;
  propertyType?: string;
  folderStructure?: ProjectFolderStructure;
  effectiveDate?: string;
  reportDueDate?: string;
  exposureTime?: string;
  highestBestUse?: string;
  /** Corresponds to `insurance_price_per_sf` on `projects`. */
  insurancePricePerSf?: number;
  /** Corresponds to `vacancy_rate` on `projects`. */
  vacancyRate?: number;
  /** Monthly market conditions rate (% increase per month) for the adjustment grid. */
  percentIncPerMonth?: number;
  /** Report appraisal approaches (JSONB on `projects`). */
  approaches?: ProjectApproaches;
}

export type ProjectsMap = Record<string, ProjectData>;

// ============================================================
// View Model Types (component-facing, constructed at runtime)
// ============================================================

/**
 * Combines Comparable data with MapMarker positions for rendering.
 * Used by ComparableMarker, ComparablesPanel, etc.
 */
export interface ComparableInfo {
  id: string;
  number?: string;
  address: string;
  addressForDisplay: string;
  isTailPinned: boolean;
  type: ComparableType;
  pinnedTailTipPosition?: LatLng;
  position?: LatLng;
  markerPosition?: LatLng;
  distance?: string;
  apn?: string[];
  instrumentNumber?: string;
  folderId?: string;
  images?: ImageData[];
}

// ============================================================
// Legacy Types (for migration from old localStorage shape)
// ============================================================

interface LegacyComparableInfo {
  id: string;
  number?: string;
  address: string;
  addressForDisplay: string;
  isTailPinned: boolean;
  type: ComparableType;
  pinnedTailTipPosition?: LatLng;
  position?: LatLng;
  markerPosition?: LatLng;
  distance?: string;
  apn?: string[];
  instrumentNumber?: string;
  folderId?: string;
  images?: ImageData[];
}

interface LegacyLocationMapState {
  propertyInfo?: SubjectInfo;
  markerPosition?: LatLng | null;
  bubblePosition?: LatLng | null;
  polygonPath?: PolygonPath[];
  circles?: Circle[];
  polylines?: Polyline[];
  mapCenter?: LatLng;
  mapZoom?: number;
  bubbleSize?: number;
  tailDirection?: "left" | "right";
  hideUI?: boolean;
  isSubjectTailPinned?: boolean;
  subjectPinnedTailTipPosition?: LatLng | null;
  streetLabels?: StreetLabelData[];
  labelSize?: number;
  circleRadius?: 1 | 2 | 3 | 5;
  documentFrameSize?: number;
}

interface LegacyComparablesMapState {
  subjectMarkerPosition?: LatLng | null;
  subjectBubblePosition?: LatLng | null;
  comparables?: LegacyComparableInfo[];
  mapCenter?: LatLng;
  mapZoom?: number;
  bubbleSize?: number;
  hideUI?: boolean;
  documentFrameSize?: number;
  isSubjectTailPinned?: boolean;
  subjectPinnedTailTipPosition?: LatLng | null;
  landLocationMaps?: Record<string, LegacyLocationMapState>;
  salesLocationMaps?: Record<string, LegacyLocationMapState>;
  rentalsLocationMaps?: Record<string, LegacyLocationMapState>;
}

interface LegacyProjectData {
  subject?: {
    info?: SubjectInfo;
    markerPosition?: LatLng | null;
    bubblePosition?: LatLng | null;
    isTailPinned?: boolean;
    pinnedTailTipPosition?: LatLng | null;
  };
  comparables?: {
    byType?: Partial<Record<ComparableType, LegacyComparablesMapState>>;
    activeType?: ComparableType;
  };
  location?: LegacyLocationMapState;
  neighborhood?: LegacyLocationMapState;
  subjectPhotosFolderId?: string;
  projectFolderId?: string;
  clientCompany?: string;
  clientName?: string;
  propertyType?: string;
}

// ============================================================
// Constants
// ============================================================

export const PROJECTS_STORAGE_KEY = "appraisal-projects";
export const CURRENT_PROJECT_STORAGE_KEY = "appraisal-current-project";

export const DEFAULT_MAP_CENTER: LatLng = { lat: 31.8458, lng: -102.3676 };
export const DEFAULT_LABEL_SIZE = 1.0;
export const DEFAULT_CIRCLE_RADIUS: 1 | 2 | 3 | 5 = 2;

export const WELL_KNOWN_MAP_IDS: Record<
  Exclude<MapType, "comp-location">,
  string
> = {
  "subject-location": "map-subject-location",
  neighborhood: "map-neighborhood",
  "land-comps": "map-land-comps",
  "sales-comps": "map-sales-comps",
  "rentals-comps": "map-rentals-comps",
};

const DEFAULT_DRAWINGS: MapDrawings = {
  polygonPath: [],
  circles: [],
  polylines: [],
  streetLabels: [],
  labelSize: DEFAULT_LABEL_SIZE,
  circleRadius: DEFAULT_CIRCLE_RADIUS,
  tailDirection: "right",
};

// ============================================================
// Map Type <-> Comparable Type helpers
// ============================================================

export function mapTypeForCompType(
  compType: ComparableType,
): Exclude<MapType, "comp-location"> {
  switch (compType) {
    case "Land":
      return "land-comps";
    case "Sales":
      return "sales-comps";
    case "Rentals":
      return "rentals-comps";
  }
}

export function compTypeForMapType(
  mapType: MapType,
): ComparableType | undefined {
  switch (mapType) {
    case "land-comps":
      return "Land";
    case "sales-comps":
      return "Sales";
    case "rentals-comps":
      return "Rentals";
    default:
      return undefined;
  }
}

export function compLocationMapId(compId: string): string {
  return `map-comp-location-${compId}`;
}

// ============================================================
// View model builders
// ============================================================

export function buildComparableInfo(
  comp: Comparable,
  marker?: MapMarker,
): ComparableInfo {
  return {
    id: comp.id,
    number: comp.number,
    address: comp.address,
    addressForDisplay: comp.addressForDisplay,
    type: comp.type,
    apn: comp.apn,
    instrumentNumber: comp.instrumentNumber,
    folderId: comp.folderId,
    images: comp.images,
    isTailPinned: marker?.isTailPinned ?? true,
    pinnedTailTipPosition: marker?.pinnedTailTipPosition ?? undefined,
    position: marker?.bubblePosition ?? undefined,
    markerPosition: marker?.markerPosition ?? undefined,
  };
}

export function splitComparableInfo(
  info: ComparableInfo,
  mapId: string,
): { comparable: Comparable; marker: MapMarker } {
  return {
    comparable: {
      id: info.id,
      type: info.type,
      number: info.number,
      address: info.address,
      addressForDisplay: info.addressForDisplay,
      apn: info.apn,
      instrumentNumber: info.instrumentNumber,
      folderId: info.folderId,
      images: info.images,
    },
    marker: {
      id: `marker-${info.id}-${mapId}`,
      mapId,
      compId: info.id,
      markerPosition: info.markerPosition ?? null,
      bubblePosition: info.position ?? null,
      isTailPinned: info.isTailPinned,
      pinnedTailTipPosition: info.pinnedTailTipPosition ?? null,
    },
  };
}

// ============================================================
// Map / marker access helpers
// ============================================================

export function getMapByType(
  project: ProjectData,
  type: MapType,
): MapView | undefined {
  return project.maps.find((m) => m.type === type);
}

export function getMapForComp(
  project: ProjectData,
  compId: string,
): MapView | undefined {
  return project.maps.find(
    (m) => m.type === "comp-location" && m.linkedCompId === compId,
  );
}

export function getSubjectMarker(mapView: MapView): MapMarker | undefined {
  return mapView.markers.find((m) => !m.compId);
}

export function getCompMarker(
  mapView: MapView,
  compId: string,
): MapMarker | undefined {
  return mapView.markers.find((m) => m.compId === compId);
}

export function getComparablesByType(
  project: ProjectData,
  type: ComparableType,
): Comparable[] {
  const list = project.comparables.filter((c) => c.type === type);
  return sortComparables(list);
}

// ============================================================
// Detection: legacy shape?
// ============================================================

function isLegacyShape(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if ("location" in d) return true;
  if (
    d.comparables &&
    typeof d.comparables === "object" &&
    !Array.isArray(d.comparables)
  )
    return true;
  return false;
}

// ============================================================
// Migration: Legacy → New
// ============================================================

function migrateLegacyProject(legacy: LegacyProjectData): ProjectData {
  const subject: SubjectInfo = {
    address: legacy.subject?.info?.address ?? "",
    addressForDisplay: legacy.subject?.info?.addressForDisplay ?? "",
    legalDescription: legacy.subject?.info?.legalDescription ?? "",
    acres: legacy.subject?.info?.acres ?? "",
  };

  const comparables: Comparable[] = [];
  const maps: MapView[] = [];

  // --- Subject Location Map ---
  const slId = WELL_KNOWN_MAP_IDS["subject-location"];
  maps.push({
    id: slId,
    type: "subject-location",
    mapCenter: legacy.location?.mapCenter
      ? { ...legacy.location.mapCenter }
      : { ...DEFAULT_MAP_CENTER },
    mapZoom: legacy.location?.mapZoom ?? 17,
    bubbleSize: legacy.location?.bubbleSize ?? 1.0,
    hideUI: legacy.location?.hideUI ?? false,
    documentFrameSize: legacy.location?.documentFrameSize ?? 1.0,
    drawings: migrateDrawings(legacy.location),
    markers: [
      {
        id: `marker-subject-${slId}`,
        mapId: slId,
        markerPosition:
          legacy.subject?.markerPosition ??
          legacy.location?.markerPosition ??
          null,
        bubblePosition:
          legacy.subject?.bubblePosition ??
          legacy.location?.bubblePosition ??
          null,
        isTailPinned:
          legacy.location?.isSubjectTailPinned ??
          legacy.subject?.isTailPinned ??
          true,
        pinnedTailTipPosition:
          legacy.location?.subjectPinnedTailTipPosition ??
          legacy.subject?.pinnedTailTipPosition ??
          null,
      },
    ],
  });

  // --- Neighborhood Map ---
  const nhId = WELL_KNOWN_MAP_IDS.neighborhood;
  maps.push({
    id: nhId,
    type: "neighborhood",
    mapCenter: legacy.neighborhood?.mapCenter
      ? { ...legacy.neighborhood.mapCenter }
      : { ...DEFAULT_MAP_CENTER },
    mapZoom: legacy.neighborhood?.mapZoom ?? 17,
    bubbleSize: legacy.neighborhood?.bubbleSize ?? 1.0,
    hideUI: legacy.neighborhood?.hideUI ?? false,
    documentFrameSize: legacy.neighborhood?.documentFrameSize ?? 1.0,
    drawings: migrateDrawings(legacy.neighborhood),
    markers: [
      {
        id: `marker-subject-${nhId}`,
        mapId: nhId,
        markerPosition:
          legacy.neighborhood?.markerPosition ??
          legacy.subject?.markerPosition ??
          null,
        bubblePosition:
          legacy.neighborhood?.bubblePosition ??
          legacy.subject?.bubblePosition ??
          null,
        isTailPinned:
          legacy.neighborhood?.isSubjectTailPinned ??
          legacy.subject?.isTailPinned ??
          true,
        pinnedTailTipPosition:
          legacy.neighborhood?.subjectPinnedTailTipPosition ??
          legacy.subject?.pinnedTailTipPosition ??
          null,
      },
    ],
  });

  // --- Comparables Maps (per type) ---
  for (const compType of COMPARABLE_TYPES) {
    const typeState = legacy.comparables?.byType?.[compType];
    const mType = mapTypeForCompType(compType);
    const mId = WELL_KNOWN_MAP_IDS[mType];
    const markers: MapMarker[] = [];

    markers.push({
      id: `marker-subject-${mId}`,
      mapId: mId,
      markerPosition:
        typeState?.subjectMarkerPosition ??
        legacy.subject?.markerPosition ??
        null,
      bubblePosition:
        typeState?.subjectBubblePosition ??
        legacy.subject?.bubblePosition ??
        null,
      isTailPinned: typeState?.isSubjectTailPinned ?? true,
      pinnedTailTipPosition: typeState?.subjectPinnedTailTipPosition ?? null,
    });

    for (const comp of typeState?.comparables ?? []) {
      comparables.push({
        id: comp.id,
        type: comp.type ?? compType,
        number: comp.number,
        address: comp.address ?? "",
        addressForDisplay: comp.addressForDisplay ?? comp.address ?? "",
        apn: comp.apn,
        instrumentNumber: comp.instrumentNumber,
        folderId: comp.folderId,
        images: comp.images,
      });

      markers.push({
        id: `marker-${comp.id}-${mId}`,
        mapId: mId,
        compId: comp.id,
        markerPosition: comp.markerPosition ?? null,
        bubblePosition: comp.position ?? null,
        isTailPinned: comp.isTailPinned ?? true,
        pinnedTailTipPosition: comp.pinnedTailTipPosition ?? null,
      });
    }

    maps.push({
      id: mId,
      type: mType,
      mapCenter: typeState?.mapCenter
        ? { ...typeState.mapCenter }
        : { ...DEFAULT_MAP_CENTER },
      mapZoom: typeState?.mapZoom ?? 17,
      bubbleSize: typeState?.bubbleSize ?? 1.0,
      hideUI: typeState?.hideUI ?? false,
      documentFrameSize: typeState?.documentFrameSize ?? 1.0,
      drawings: { ...DEFAULT_DRAWINGS },
      markers,
    });

    // --- Comp Location Maps ---
    const locationMaps =
      compType === "Land"
        ? typeState?.landLocationMaps
        : compType === "Sales"
          ? typeState?.salesLocationMaps
          : typeState?.rentalsLocationMaps;

    if (locationMaps) {
      for (const [cId, locState] of Object.entries(locationMaps)) {
        const clmId = compLocationMapId(cId);
        maps.push({
          id: clmId,
          type: "comp-location",
          linkedCompId: cId,
          mapCenter: locState.mapCenter
            ? { ...locState.mapCenter }
            : { ...DEFAULT_MAP_CENTER },
          mapZoom: locState.mapZoom ?? 17,
          bubbleSize: locState.bubbleSize ?? 1.0,
          hideUI: locState.hideUI ?? false,
          documentFrameSize: locState.documentFrameSize ?? 1.0,
          drawings: migrateDrawings(locState),
          markers: [
            {
              id: `marker-${cId}-${clmId}`,
              mapId: clmId,
              compId: cId,
              markerPosition: locState.markerPosition ?? null,
              bubblePosition: locState.bubblePosition ?? null,
              isTailPinned: locState.isSubjectTailPinned ?? true,
              pinnedTailTipPosition:
                locState.subjectPinnedTailTipPosition ?? null,
            },
          ],
        });
      }
    }
  }

  return {
    subject,
    comparables,
    maps,
    projectFolderId: legacy.projectFolderId,
    clientCompany: legacy.clientCompany,
    clientName: legacy.clientName,
    propertyType: legacy.propertyType,
  };
}

function migrateDrawings(loc?: LegacyLocationMapState): MapDrawings {
  return {
    polygonPath: (loc?.polygonPath ?? []).map((p) => ({
      lat: p.lat,
      lng: p.lng,
    })),
    circles: (loc?.circles ?? []).map((c) => ({
      ...c,
      center: { lat: c.center.lat, lng: c.center.lng },
    })),
    polylines: (loc?.polylines ?? []).map((p) => ({
      ...p,
      path: p.path.map((pt) => ({ lat: pt.lat, lng: pt.lng })),
    })),
    streetLabels: (loc?.streetLabels ?? []).map((l) => ({
      id: l.id,
      position: { lat: l.position.lat, lng: l.position.lng },
      text: l.text,
      rotation: l.rotation,
    })),
    labelSize: loc?.labelSize ?? DEFAULT_LABEL_SIZE,
    circleRadius: loc?.circleRadius ?? DEFAULT_CIRCLE_RADIUS,
    tailDirection: loc?.tailDirection ?? "right",
  };
}

// ============================================================
// Normalization (new shape)
// ============================================================

function cloneLatLng(value?: LatLng | null): LatLng | null {
  if (!value) return null;
  return { lat: value.lat, lng: value.lng };
}

function normalizeDrawings(d?: Partial<MapDrawings>): MapDrawings {
  return {
    polygonPath: Array.isArray(d?.polygonPath)
      ? d.polygonPath.map((p) => ({ lat: p.lat, lng: p.lng }))
      : [],
    circles: Array.isArray(d?.circles)
      ? d.circles.map((c) => ({
          ...c,
          center: { lat: c.center.lat, lng: c.center.lng },
        }))
      : [],
    polylines: Array.isArray(d?.polylines)
      ? d.polylines.map((p) => ({
          ...p,
          path: p.path.map((pt) => ({ lat: pt.lat, lng: pt.lng })),
        }))
      : [],
    streetLabels: Array.isArray(d?.streetLabels)
      ? d.streetLabels.map((l) => ({
          id: l.id,
          position: { lat: l.position.lat, lng: l.position.lng },
          text: l.text,
          rotation: l.rotation,
        }))
      : [],
    labelSize:
      typeof d?.labelSize === "number" ? d.labelSize : DEFAULT_LABEL_SIZE,
    circleRadius: d?.circleRadius ?? DEFAULT_CIRCLE_RADIUS,
    tailDirection:
      d?.tailDirection === "left" || d?.tailDirection === "right"
        ? d.tailDirection
        : "right",
  };
}

function normalizeMarker(
  m: Partial<MapMarker>,
  fallbackMapId: string,
): MapMarker {
  return {
    id: m.id ?? `marker-${Date.now()}-${Math.random()}`,
    mapId: m.mapId ?? fallbackMapId,
    compId: m.compId,
    markerPosition: cloneLatLng(m.markerPosition),
    bubblePosition: cloneLatLng(m.bubblePosition),
    isTailPinned: typeof m.isTailPinned === "boolean" ? m.isTailPinned : true,
    pinnedTailTipPosition: cloneLatLng(m.pinnedTailTipPosition),
  };
}

function normalizeMapView(m: Partial<MapView>): MapView {
  const id = m.id ?? `map-${Date.now()}-${Math.random()}`;
  return {
    id,
    type: m.type ?? "subject-location",
    linkedCompId: m.linkedCompId,
    mapCenter: cloneLatLng(m.mapCenter) ?? { ...DEFAULT_MAP_CENTER },
    mapZoom: typeof m.mapZoom === "number" ? m.mapZoom : 17,
    bubbleSize: typeof m.bubbleSize === "number" ? m.bubbleSize : 1.0,
    hideUI: typeof m.hideUI === "boolean" ? m.hideUI : false,
    documentFrameSize:
      typeof m.documentFrameSize === "number" ? m.documentFrameSize : 1.0,
    drawings: normalizeDrawings(m.drawings),
    markers: Array.isArray(m.markers)
      ? m.markers.map((mk) => normalizeMarker(mk, id))
      : [],
    imageFileId:
      typeof m.imageFileId === "string" && m.imageFileId.trim() !== ""
        ? m.imageFileId.trim()
        : undefined,
  };
}

function normalizeComparableEntity(
  c: Partial<Comparable>,
  fallbackType: ComparableType = "Land",
): Comparable {
  const resolvedType =
    c.type && COMPARABLE_TYPES.includes(c.type) ? c.type : fallbackType;
  const status = c.parsedDataStatus;
  const validStatuses: ComparableParsedDataStatus[] = [
    "none",
    "processing",
    "parsed",
    "error",
  ];
  const parsedDataStatus =
    status && validStatuses.includes(status) ? status : undefined;

  return {
    id:
      typeof c.id === "string" && c.id.trim().length > 0
        ? c.id
        : `comp-${Date.now()}-${Math.random()}`,
    type: resolvedType,
    number: c.number,
    address: c.address ?? "",
    addressForDisplay: c.addressForDisplay ?? c.address ?? "",
    apn: Array.isArray(c.apn) && c.apn.length > 0 ? c.apn : undefined,
    instrumentNumber:
      typeof c.instrumentNumber === "string" &&
      c.instrumentNumber.trim().length > 0
        ? c.instrumentNumber
        : undefined,
    folderId: c.folderId,
    images: c.images,
    parsedDataStatus,
  };
}

function createDefaultMapView(type: MapType, linkedCompId?: string): MapView {
  const id =
    type === "comp-location" && linkedCompId
      ? compLocationMapId(linkedCompId)
      : (WELL_KNOWN_MAP_IDS[type as keyof typeof WELL_KNOWN_MAP_IDS] ??
        `map-${type}`);
  return {
    id,
    type,
    linkedCompId,
    mapCenter: { ...DEFAULT_MAP_CENTER },
    mapZoom: 17,
    bubbleSize: 1.0,
    hideUI: false,
    documentFrameSize: 1.0,
    drawings: {
      ...DEFAULT_DRAWINGS,
      polygonPath: [],
      circles: [],
      polylines: [],
      streetLabels: [],
    },
    markers: [],
  };
}

// ============================================================
// Public Normalization API
// ============================================================

export function normalizeProjectData(data?: unknown): ProjectData {
  if (!data || typeof data !== "object") {
    return createDefaultProject();
  }

  if (isLegacyShape(data)) {
    const migrated = migrateLegacyProject(data as LegacyProjectData);
    return normalizeNewShape(migrated);
  }

  return normalizeNewShape(data as Partial<ProjectData>);
}

function normalizeNewShape(data?: Partial<ProjectData>): ProjectData {
  const subject: SubjectInfo = {
    address: data?.subject?.address ?? "",
    addressForDisplay: data?.subject?.addressForDisplay ?? "",
    legalDescription: data?.subject?.legalDescription ?? "",
    acres: data?.subject?.acres ?? "",
  };

  const comparables = Array.isArray(data?.comparables)
    ? data.comparables.map((c) => normalizeComparableEntity(c))
    : [];

  const maps = Array.isArray(data?.maps)
    ? data.maps.map((m) => normalizeMapView(m))
    : [];

  const wellKnownTypes: Exclude<MapType, "comp-location">[] = [
    "subject-location",
    "neighborhood",
    "land-comps",
    "sales-comps",
    "rentals-comps",
  ];
  for (const wkType of wellKnownTypes) {
    if (!maps.find((m) => m.type === wkType)) {
      maps.push(createDefaultMapView(wkType));
    }
  }

  const rawFs = data as Partial<ProjectData> & {
    folder_structure?: ProjectFolderStructure;
  };
  const folderStructure =
    data?.folderStructure ?? rawFs.folder_structure;

  const rawNums = data as Partial<ProjectData> & {
    exposure_time?: string | null;
    highest_best_use?: string | null;
    insurance_price_per_sf?: number | string | null;
    vacancy_rate?: number | string | null;
  };
  const insurancePricePerSf =
    data?.insurancePricePerSf ??
    (typeof rawNums.insurance_price_per_sf === "number"
      ? rawNums.insurance_price_per_sf
      : rawNums.insurance_price_per_sf != null &&
          rawNums.insurance_price_per_sf !== ""
        ? Number(rawNums.insurance_price_per_sf)
        : undefined);
  const vacancyRate =
    data?.vacancyRate ??
    (typeof rawNums.vacancy_rate === "number"
      ? rawNums.vacancy_rate
      : rawNums.vacancy_rate != null && rawNums.vacancy_rate !== ""
        ? Number(rawNums.vacancy_rate)
        : undefined);

  return {
    subject,
    comparables,
    maps,
    projectFolderId: data?.projectFolderId,
    clientCompany: data?.clientCompany,
    clientName: data?.clientName,
    propertyType: data?.propertyType,
    folderStructure,
    effectiveDate: data?.effectiveDate,
    reportDueDate: data?.reportDueDate,
    exposureTime: data?.exposureTime ?? rawNums.exposure_time ?? undefined,
    highestBestUse:
      data?.highestBestUse ?? rawNums.highest_best_use ?? undefined,
    insurancePricePerSf:
      insurancePricePerSf != null && !Number.isNaN(insurancePricePerSf)
        ? insurancePricePerSf
        : undefined,
    vacancyRate:
      vacancyRate != null && !Number.isNaN(vacancyRate)
        ? vacancyRate
        : undefined,
    approaches: normalizeProjectApproaches(data?.approaches),
  };
}

export function createDefaultProject(): ProjectData {
  return normalizeNewShape({});
}

export function cloneProject(project: ProjectData): ProjectData {
  return normalizeProjectData(project);
}

export function normalizeProjectsMap(
  raw?: Record<string, unknown>,
): ProjectsMap {
  if (!raw) return {};
  return Object.entries(raw).reduce<ProjectsMap>((acc, [key, value]) => {
    if (typeof key !== "string" || !key.trim()) return acc;
    acc[key] = normalizeProjectData(value);
    return acc;
  }, {});
}

export function getNextProjectName(existingNames: string[]): string {
  let counter = existingNames.length + 1;
  let candidate = `Project ${counter}`;
  while (existingNames.includes(candidate)) {
    counter += 1;
    candidate = `Project ${counter}`;
  }
  return candidate;
}

/**
 * Update a specific MapView in a project's maps array.
 * Returns a new maps array with the specified map replaced.
 */
export function updateMapInProject(
  project: ProjectData,
  mapId: string,
  updater: (map: MapView) => MapView,
): MapView[] {
  return project.maps.map((m) => (m.id === mapId ? updater(m) : m));
}

/**
 * Ensure a comp-location MapView exists for the given compId.
 * Returns the existing map or creates a new default one.
 */
export function ensureCompLocationMap(
  project: ProjectData,
  compId: string,
): { map: MapView; maps: MapView[] } {
  const existing = getMapForComp(project, compId);
  if (existing) return { map: existing, maps: project.maps };
  const newMap = createDefaultMapView("comp-location", compId);
  return { map: newMap, maps: [...project.maps, newMap] };
}
