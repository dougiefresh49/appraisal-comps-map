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

export interface ProjectSubjectState {
  info: SubjectInfo;
  markerPosition: LatLng | null;
  bubblePosition: LatLng | null;
  isTailPinned: boolean;
  pinnedTailTipPosition: LatLng | null;
}

export interface ComparableInfo {
  id: string;
  address: string;
  addressForDisplay: string;
  isTailPinned: boolean;
  type: ComparableType;
  pinnedTailTipPosition?: LatLng;
  position?: LatLng;
  markerPosition?: LatLng;
  distance?: string;
  apn?: string[]; // Array of APN numbers
  instrumentNumber?: string; // Recording number
}

export interface ComparablesMapState {
  // subjectInfo removed - use subject.info instead
  subjectMarkerPosition?: LatLng | null; // Can be different per comp map
  subjectBubblePosition?: LatLng | null; // Can be different per comp map
  comparables?: ComparableInfo[];
  mapCenter?: LatLng;
  mapZoom?: number;
  bubbleSize?: number;
  hideUI?: boolean;
  // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
  landLocationMaps?: Record<string, LocationMapState>;
}

export interface ProjectComparablesState {
  byType: Record<ComparableType, ComparablesMapState>;
  activeType: ComparableType;
}

export interface PolygonPath extends LatLng {}

export interface StreetLabelData {
  id: string;
  position: LatLng;
  text: string;
  rotation: number;
  isEditing: boolean;
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

export interface LocationMapState {
  // propertyInfo removed - use subject.info instead
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
  // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
  streetLabels?: StreetLabelData[];
  labelSize?: number;
  circleRadius?: 1 | 2 | 3 | 5;
}

export interface ProjectData {
  subject: ProjectSubjectState;
  comparables: ProjectComparablesState;
  location: LocationMapState;
  subjectPhotosFolderId?: string;
  projectFolderId?: string;
  clientCompany?: string;
  clientName?: string;
  propertyType?: string;
}

export type ProjectsMap = Record<string, ProjectData>;

export const PROJECTS_STORAGE_KEY = "appraisal-projects";
export const CURRENT_PROJECT_STORAGE_KEY = "appraisal-current-project";

export const DEFAULT_MAP_CENTER: LatLng = { lat: 31.8458, lng: -102.3676 };
export const DEFAULT_LABEL_SIZE = 1.0;
export const DEFAULT_CIRCLE_RADIUS: 1 | 2 | 3 | 5 = 2;

const SUBJECT_DEFAULT: ProjectSubjectState = {
  info: {
    address: "",
    addressForDisplay: "",
  },
  markerPosition: null,
  bubblePosition: null,
  isTailPinned: true,
  pinnedTailTipPosition: null,
};

const LOCATION_DEFAULT: LocationMapState = {
  // propertyInfo removed - use subject.info instead
  markerPosition: SUBJECT_DEFAULT.markerPosition,
  bubblePosition: SUBJECT_DEFAULT.bubblePosition,
  polygonPath: [],
  circles: [],
  mapCenter: { ...DEFAULT_MAP_CENTER },
  mapZoom: 17,
  bubbleSize: 1.0,
  tailDirection: "right",
  hideUI: false,
  // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
  streetLabels: [],
  labelSize: DEFAULT_LABEL_SIZE,
  circleRadius: DEFAULT_CIRCLE_RADIUS,
};

function isComparableType(value: unknown): value is ComparableType {
  return (
    typeof value === "string" &&
    (value === "Land" || value === "Sales" || value === "Rentals")
  );
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

function cloneLatLng(value?: LatLng | null): LatLng | null {
  if (!value) return null;
  return { lat: value.lat, lng: value.lng };
}

function cloneStreetLabel(label: StreetLabelData): StreetLabelData {
  return {
    ...label,
    position: cloneLatLng(label.position) ?? { lat: 0, lng: 0 },
  };
}

function cloneCircle(circle: Circle): Circle {
  return {
    ...circle,
    center: cloneLatLng(circle.center) ?? { lat: 0, lng: 0 },
  };
}

function cloneLandLocationState(
  input?: LocationMapState,
): LocationMapState {
  // propertyInfo removed - use subject.info instead
  return {
    markerPosition: cloneLatLng(
      input?.markerPosition ?? null,
    ),
    bubblePosition: cloneLatLng(
      input?.bubblePosition ?? null,
    ),
    polygonPath: Array.isArray(input?.polygonPath)
      ? input!.polygonPath!.map((point) => ({ lat: point.lat, lng: point.lng }))
      : [],
    circles: Array.isArray(input?.circles)
      ? input!.circles!.map(cloneCircle)
      : [],
    polylines: Array.isArray(input?.polylines)
      ? input!.polylines!.map((polyline) => ({
          ...polyline,
          path: polyline.path.map((point) => ({ lat: point.lat, lng: point.lng })),
        }))
      : [],
    mapCenter:
      cloneLatLng(input?.mapCenter ?? null) ?? { ...DEFAULT_MAP_CENTER },
    mapZoom:
      typeof input?.mapZoom === "number" ? input.mapZoom : 17,
    bubbleSize:
      typeof input?.bubbleSize === "number"
        ? input.bubbleSize
        : 1.0,
    tailDirection:
      input?.tailDirection === "left" || input?.tailDirection === "right"
        ? input.tailDirection
        : "right",
    hideUI:
      typeof input?.hideUI === "boolean" ? input.hideUI : false,
    // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
    streetLabels: Array.isArray(input?.streetLabels)
      ? input!.streetLabels!.map(cloneStreetLabel)
      : [],
    labelSize:
      typeof input?.labelSize === "number"
        ? input.labelSize
        : DEFAULT_LABEL_SIZE,
    circleRadius:
      input?.circleRadius ?? DEFAULT_CIRCLE_RADIUS,
  };
}

function createEmptyComparablesMapState(
  subject: ProjectSubjectState,
  type: ComparableType,
): ComparablesMapState {
  return {
    // subjectInfo removed - use subject.info instead
    subjectMarkerPosition: subject.markerPosition,
    subjectBubblePosition: subject.bubblePosition,
    comparables: [],
    mapCenter: { ...DEFAULT_MAP_CENTER },
    mapZoom: 17,
    bubbleSize: 1.0,
    hideUI: false,
    // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
    landLocationMaps: type === "Land" ? {} : undefined,
  };
}

function normalizeComparable(
  comparable: Partial<ComparableInfo> & { propertyType?: string },
  fallbackType: ComparableType,
): ComparableInfo {
  const resolvedType =
    comparable.type && isComparableType(comparable.type)
      ? comparable.type
      : comparable.propertyType && isComparableType(comparable.propertyType)
        ? comparable.propertyType
        : fallbackType;
  return {
    id:
      typeof comparable.id === "string" && comparable.id.trim().length > 0
        ? comparable.id
        : `comp-${Date.now()}-${Math.random()}`,
    address: comparable.address ?? "",
    addressForDisplay:
      comparable.addressForDisplay ??
      comparable.address ??
      "",
    isTailPinned:
      typeof comparable.isTailPinned === "boolean"
        ? comparable.isTailPinned
        : true,
    type: resolvedType,
    pinnedTailTipPosition:
      cloneLatLng(comparable.pinnedTailTipPosition ?? null) ?? undefined,
    position: cloneLatLng(comparable.position ?? null) ?? undefined,
    markerPosition: cloneLatLng(comparable.markerPosition ?? null) ?? undefined,
    distance: comparable.distance,
    apn:
      Array.isArray(comparable.apn) && comparable.apn.length > 0
        ? comparable.apn
        : undefined,
    instrumentNumber:
      typeof comparable.instrumentNumber === "string" &&
      comparable.instrumentNumber.trim().length > 0
        ? comparable.instrumentNumber
        : undefined,
  };
}

function normalizeSubjectState(
  input?: Partial<ProjectSubjectState>,
): ProjectSubjectState {
  const info = input?.info ?? {};
  return {
    info: {
      address: info.address ?? SUBJECT_DEFAULT.info.address,
      addressForDisplay:
        info.addressForDisplay ?? SUBJECT_DEFAULT.info.addressForDisplay,
      legalDescription:
        info.legalDescription ?? SUBJECT_DEFAULT.info.legalDescription,
      acres: info.acres ?? SUBJECT_DEFAULT.info.acres,
    },
    markerPosition: cloneLatLng(
      input?.markerPosition ?? SUBJECT_DEFAULT.markerPosition,
    ),
    bubblePosition: cloneLatLng(
      input?.bubblePosition ?? SUBJECT_DEFAULT.bubblePosition,
    ),
    isTailPinned:
      typeof input?.isTailPinned === "boolean"
        ? input.isTailPinned
        : SUBJECT_DEFAULT.isTailPinned,
    pinnedTailTipPosition: cloneLatLng(
      input?.pinnedTailTipPosition ?? SUBJECT_DEFAULT.pinnedTailTipPosition,
    ),
  };
}

function normalizeComparablesMapState(
  subject: ProjectSubjectState,
  input: ComparablesMapState | undefined,
  fallbackType: ComparableType,
): ComparablesMapState {
  const comparablesArray = Array.isArray(input?.comparables)
    ? input!.comparables!
    : [];

  return {
    // subjectInfo removed - use subject.info instead
    subjectMarkerPosition:
      input?.subjectMarkerPosition !== undefined
        ? cloneLatLng(input.subjectMarkerPosition)
        : subject.markerPosition,
    subjectBubblePosition:
      input?.subjectBubblePosition !== undefined
        ? cloneLatLng(input.subjectBubblePosition)
        : subject.bubblePosition,
    comparables: comparablesArray.map((comparable) =>
      normalizeComparable(comparable, fallbackType),
    ),
    mapCenter:
      input?.mapCenter !== undefined
        ? cloneLatLng(input.mapCenter) ?? { ...DEFAULT_MAP_CENTER }
        : { ...DEFAULT_MAP_CENTER },
    mapZoom:
      typeof input?.mapZoom === "number" ? input.mapZoom : 17,
    bubbleSize:
      typeof input?.bubbleSize === "number"
        ? input.bubbleSize
        : 1.0,
    hideUI:
      typeof input?.hideUI === "boolean" ? input.hideUI : false,
    // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
    landLocationMaps:
      fallbackType === "Land"
        ? Object.entries(input?.landLocationMaps ?? {}).reduce<
            Record<string, LocationMapState>
          >((acc, [compId, state]) => {
            acc[compId] = cloneLandLocationState(state);
            return acc;
          }, {})
        : undefined,
  };
}

function normalizeProjectComparables(
  subject: ProjectSubjectState,
  input?: ProjectComparablesState | ComparablesMapState,
): ProjectComparablesState {
  const defaultByType: Record<ComparableType, ComparablesMapState> = {
    Land: createEmptyComparablesMapState(subject, "Land"),
    Sales: createEmptyComparablesMapState(subject, "Sales"),
    Rentals: createEmptyComparablesMapState(subject, "Rentals"),
  };

  if (
    input &&
    typeof input === "object" &&
    "byType" in input &&
    input.byType &&
    typeof input.byType === "object"
  ) {
    const byTypeInput = (input as ProjectComparablesState).byType ?? {};
    const activeTypeInput = (input as ProjectComparablesState).activeType;
    return {
      byType: {
        Land: normalizeComparablesMapState(subject, byTypeInput.Land, "Land"),
        Sales: normalizeComparablesMapState(subject, byTypeInput.Sales, "Sales"),
        Rentals: normalizeComparablesMapState(
          subject,
          byTypeInput.Rentals,
          "Rentals",
        ),
      },
      activeType: isComparableType(activeTypeInput)
        ? activeTypeInput
        : "Land",
    };
  }

  const legacyState = normalizeComparablesMapState(
    subject,
    input as ComparablesMapState | undefined,
    "Land",
  );

  return {
    byType: {
      Land: legacyState,
      Sales: createEmptyComparablesMapState(subject, "Sales"),
      Rentals: createEmptyComparablesMapState(subject, "Rentals"),
    },
    activeType: "Land",
  };
}

function normalizeLocationState(
  subject: ProjectSubjectState,
  input?: LocationMapState,
): LocationMapState {
  return {
    // propertyInfo removed - use subject.info instead
    markerPosition:
      input?.markerPosition !== undefined
        ? cloneLatLng(input.markerPosition)
        : subject.markerPosition,
    bubblePosition:
      input?.bubblePosition !== undefined
        ? cloneLatLng(input.bubblePosition)
        : subject.bubblePosition,
    polygonPath: Array.isArray(input?.polygonPath)
      ? input!.polygonPath!.map((point) => ({ lat: point.lat, lng: point.lng }))
      : [],
    circles: Array.isArray(input?.circles)
      ? input!.circles!.map(cloneCircle)
      : [],
    polylines: Array.isArray(input?.polylines)
      ? input!.polylines!.map((polyline) => ({
          ...polyline,
          path: polyline.path.map((point) => ({ lat: point.lat, lng: point.lng })),
        }))
      : [],
    mapCenter:
      input?.mapCenter !== undefined
        ? cloneLatLng(input.mapCenter) ?? { ...DEFAULT_MAP_CENTER }
        : { ...DEFAULT_MAP_CENTER },
    mapZoom:
      typeof input?.mapZoom === "number" ? input.mapZoom : 17,
    bubbleSize:
      typeof input?.bubbleSize === "number"
        ? input.bubbleSize
        : 1.0,
    tailDirection:
      input?.tailDirection === "left" || input?.tailDirection === "right"
        ? input.tailDirection
        : "right",
    hideUI:
      typeof input?.hideUI === "boolean" ? input.hideUI : false,
    // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
    streetLabels: Array.isArray(input?.streetLabels)
      ? input!.streetLabels!.map(cloneStreetLabel)
      : [],
    labelSize:
      typeof input?.labelSize === "number"
        ? input.labelSize
        : DEFAULT_LABEL_SIZE,
    circleRadius:
      input?.circleRadius ?? DEFAULT_CIRCLE_RADIUS,
  };
}

export function createDefaultProject(): ProjectData {
  const subject = normalizeSubjectState(SUBJECT_DEFAULT);
  const comparables = normalizeProjectComparables(subject, undefined);
  const location = normalizeLocationState(subject, LOCATION_DEFAULT);
  return { subject, comparables, location };
}

export function normalizeProjectData(data?: Partial<ProjectData>): ProjectData {
  const subject = normalizeSubjectState(data?.subject);
  const comparables = normalizeProjectComparables(subject, data?.comparables);
  const location = normalizeLocationState(subject, data?.location);
  return {
    subject,
    comparables,
    location,
    subjectPhotosFolderId: data?.subjectPhotosFolderId,
    projectFolderId: data?.projectFolderId,
    clientCompany: data?.clientCompany,
    clientName: data?.clientName,
    propertyType: data?.propertyType,
  };
}

export function cloneProject(project: ProjectData): ProjectData {
  return normalizeProjectData(project);
}

export function normalizeProjectsMap(
  raw?: Record<string, Partial<ProjectData>>,
): ProjectsMap {
  if (!raw) {
    return {};
  }
  return Object.entries(raw).reduce<ProjectsMap>((acc, [key, value]) => {
    if (typeof key !== "string" || !key.trim()) {
      return acc;
    }
    acc[key] = normalizeProjectData(value);
    return acc;
  }, {});
}

