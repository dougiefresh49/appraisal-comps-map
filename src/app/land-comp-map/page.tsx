"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { env } from "~/env";
import { SubjectLocationMarker } from "~/components/SubjectLocationMarker";
import { PolygonDrawingTool } from "~/components/PolygonDrawingTool";
import { CircleDrawingTool } from "~/components/CircleDrawingTool";
import { PropertyInfoPanel } from "~/components/PropertyInfoPanel";
import { StreetLabel } from "~/components/StreetLabel";
import { PinnedTailOverlay } from "~/components/PinnedTailOverlay";
import {
  createDefaultProject,
  normalizeProjectData,
  normalizeProjectsMap,
  getNextProjectName,
  PROJECTS_STORAGE_KEY,
  CURRENT_PROJECT_STORAGE_KEY,
  DEFAULT_MAP_CENTER,
  DEFAULT_LABEL_SIZE,
  DEFAULT_CIRCLE_RADIUS,
} from "~/utils/projectStore";
import type {
  ProjectsMap,
  ProjectData,
  ComparableInfo,
  SubjectInfo,
  StreetLabelData,
  Circle,
  PolygonPath,
  ProjectSubjectState,
  LocationMapState,
  ComparablesMapState,
} from "~/utils/projectStore";
import {
  encodeState,
  decodeState,
  MAX_URL_STATE_LENGTH,
} from "~/utils/statePersistence";

type PropertyInfo = SubjectInfo;

export default function LandCompMapPage() {
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project") ?? undefined;
  const compId = searchParams.get("compId") ?? undefined;
  const mapStateParam = searchParams.get("mapState") ?? undefined;

  const projectStoreRef = useRef<ProjectsMap>({});
  const serializedProjectRef = useRef<ProjectData | null>(null);

  const [projectName, setProjectName] = useState<string>(
    projectParam ?? "Project 1",
  );
  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo>({
    address: "",
    addressForDisplay: "",
    legalDescription: "",
    acres: "",
  });
  const [markerPosition, setMarkerPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [bubblePosition, setBubblePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [polygonPath, setPolygonPath] = useState<PolygonPath[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingCircle, setIsDrawingCircle] = useState(false);
  const [circleRadius, setCircleRadius] = useState<1 | 2 | 3 | 5>(DEFAULT_CIRCLE_RADIUS);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ ...DEFAULT_MAP_CENTER });
  const [mapZoom, setMapZoom] = useState(17);
  const [bubbleSize, setBubbleSize] = useState(1.0);
  const [tailDirection, setTailDirection] = useState<"left" | "right">("right");
  const [hideUI, setHideUI] = useState(false);
  const [isSubjectTailPinned, setIsSubjectTailPinned] = useState(true);
  const [subjectPinnedTailTipPosition, setSubjectPinnedTailTipPosition] = useState<
    { lat: number; lng: number } | undefined
  >(undefined);
  const [isRepositioningSubjectTail, setIsRepositioningSubjectTail] = useState(false);
  const [streetLabels, setStreetLabels] = useState<StreetLabelData[]>([]);
  const [labelSize, setLabelSize] = useState(DEFAULT_LABEL_SIZE);
  const [isStateHydrated, setIsStateHydrated] = useState(false);
  const [comparable, setComparable] = useState<ComparableInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const markerPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const bubblePositionRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    markerPositionRef.current = markerPosition;
  }, [markerPosition]);

  useEffect(() => {
    bubblePositionRef.current = bubblePosition;
  }, [bubblePosition]);

  const applyProjectState = useCallback(
    (project?: ProjectData) => {
      if (!compId) {
        setLoadError("Missing land comparable id in the URL.");
        return;
      }

      const snapshot = normalizeProjectData(project);
      const landState = snapshot.comparables.byType.Land;
      const targetComparable =
        landState.comparables?.find((entry) => entry.id === compId) ?? null;

      if (!targetComparable) {
        setLoadError(
          "Land comparable not found in this project. Switch projects or add the comparable first.",
        );
        setComparable(null);
        return;
      }

      setComparable(targetComparable);
      setLoadError(null);

      const landMapState =
        landState.landLocationMaps?.[compId] ??
        (undefined as LocationMapState | undefined);

      const resolvedPropertyInfo =
        landMapState?.propertyInfo ?? {
          address: targetComparable.address ?? "",
          addressForDisplay:
            targetComparable.addressForDisplay ??
            targetComparable.address ??
            "",
          legalDescription: "",
          acres: "",
        };

      setPropertyInfo({
        address: resolvedPropertyInfo.address ?? "",
        addressForDisplay:
          resolvedPropertyInfo.addressForDisplay ??
          resolvedPropertyInfo.address ??
          "",
        legalDescription: resolvedPropertyInfo.legalDescription ?? "",
        acres: resolvedPropertyInfo.acres ?? "",
      });

      const resolvedMarker =
        landMapState?.markerPosition ??
        targetComparable.markerPosition ??
        null;
      setMarkerPosition(resolvedMarker ? { ...resolvedMarker } : null);

      const resolvedBubble =
        landMapState?.bubblePosition ??
        targetComparable.position ??
        resolvedMarker ??
        null;
      setBubblePosition(resolvedBubble ? { ...resolvedBubble } : null);

      setPolygonPath(
        landMapState?.polygonPath
          ? landMapState.polygonPath.map((point) => ({ ...point }))
          : [],
      );
      setCircles(
        landMapState?.circles
          ? landMapState.circles.map((circle) => ({
              ...circle,
              center: { ...circle.center },
            }))
          : [],
      );
      const resolvedCenter =
        landMapState?.mapCenter ??
        resolvedMarker ??
        resolvedBubble ??
        DEFAULT_MAP_CENTER;
      setMapCenter({ ...resolvedCenter });
      setMapZoom(landMapState?.mapZoom ?? 17);
      setBubbleSize(landMapState?.bubbleSize ?? 1.0);
      setTailDirection(landMapState?.tailDirection ?? "right");
      setHideUI(landMapState?.hideUI ?? false);
      setIsSubjectTailPinned(
        landMapState?.isSubjectTailPinned ??
          targetComparable.isTailPinned ??
          true,
      );
      setSubjectPinnedTailTipPosition(
        landMapState?.subjectPinnedTailTipPosition ??
          targetComparable.pinnedTailTipPosition ??
          undefined,
      );
      setStreetLabels(
        landMapState?.streetLabels
          ? landMapState.streetLabels.map((label) => ({
              ...label,
              position: { ...label.position },
            }))
          : [],
      );
      setLabelSize(landMapState?.labelSize ?? DEFAULT_LABEL_SIZE);
      setCircleRadius(landMapState?.circleRadius ?? DEFAULT_CIRCLE_RADIUS);
      setIsDrawing(false);
      setIsDrawingCircle(false);
      setIsRepositioningSubjectTail(false);
    },
    [compId],
  );

  useEffect(() => {
    if (isStateHydrated) return;
    if (typeof window === "undefined") return;

    let projectStore: ProjectsMap = {};
    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<string, Partial<ProjectData>>;
        projectStore = normalizeProjectsMap(parsed);
      } catch (error) {
        console.error("Failed to parse stored projects", error);
      }
    }

    if (mapStateParam) {
      const decoded = decodeState(mapStateParam);
      if (decoded) {
        const normalized = normalizeProjectData(decoded);
        const existingNames = Object.keys(projectStore);
        const generatedName = getNextProjectName(existingNames);
        projectStore[generatedName] = normalized;
        setProjectName(generatedName);
      } else {
        window.alert(
          "Failed to load shared map state. The encoded data may be invalid or too large.",
        );
      }
    }

    let finalProjectName = projectName;
    const storedCurrent = window.localStorage.getItem(
      CURRENT_PROJECT_STORAGE_KEY,
    );
    if (projectParam && projectStore[projectParam]) {
      finalProjectName = projectParam;
    } else if (storedCurrent && projectStore[storedCurrent]) {
      finalProjectName = storedCurrent;
    } else if (!projectStore[finalProjectName]) {
      finalProjectName =
        Object.keys(projectStore)[0] ?? getNextProjectName(Object.keys(projectStore));
    }

    if (!projectStore[finalProjectName]) {
      projectStore[finalProjectName] = createDefaultProject();
    }

    projectStoreRef.current = projectStore;
    setProjectName(finalProjectName);

    applyProjectState(projectStore[finalProjectName]);
    serializedProjectRef.current = projectStore[finalProjectName];

    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projectStore),
      );
      window.localStorage.setItem(
        CURRENT_PROJECT_STORAGE_KEY,
        finalProjectName,
      );
    } catch (error) {
      console.error("Failed to persist projects", error);
    }

    setIsStateHydrated(true);
  }, [
    applyProjectState,
    isStateHydrated,
    mapStateParam,
    projectName,
    projectParam,
  ]);

  const persistCurrentProjectState = useCallback(() => {
    if (!projectName || !compId) return;
    const baseProject = projectStoreRef.current[projectName]
      ? normalizeProjectData(projectStoreRef.current[projectName])
      : createDefaultProject();

    const subject: ProjectSubjectState = baseProject.subject;

    const landState =
      baseProject.comparables.byType.Land ??
      (createDefaultProject().comparables.byType.Land as ComparablesMapState);

    const updatedComparables = (landState.comparables ?? []).map((comp) =>
      comp.id === compId
        ? {
            ...comp,
            address: propertyInfo.address ?? "",
            addressForDisplay:
              propertyInfo.addressForDisplay ?? propertyInfo.address ?? "",
          }
        : comp,
    );

    const landLocationSnapshot: LocationMapState = {
      propertyInfo: {
        address: propertyInfo.address ?? "",
        addressForDisplay:
          propertyInfo.addressForDisplay ?? propertyInfo.address ?? "",
        legalDescription: propertyInfo.legalDescription ?? "",
        acres: propertyInfo.acres ?? "",
      },
      markerPosition: markerPosition ? { ...markerPosition } : null,
      bubblePosition: bubblePosition ? { ...bubblePosition } : null,
      polygonPath: polygonPath.map((point) => ({ ...point })),
      circles: circles.map((circle) => ({
        ...circle,
        center: { ...circle.center },
      })),
      mapCenter: mapCenter ? { ...mapCenter } : { ...DEFAULT_MAP_CENTER },
      mapZoom,
      bubbleSize,
      tailDirection,
      hideUI,
      isSubjectTailPinned,
      subjectPinnedTailTipPosition: subjectPinnedTailTipPosition
        ? { ...subjectPinnedTailTipPosition }
        : null,
      streetLabels: streetLabels.map((label) => ({
        ...label,
        position: { ...label.position },
      })),
      labelSize,
      circleRadius,
    };

    const updatedLandState: ComparablesMapState = {
      ...landState,
      comparables: updatedComparables,
      landLocationMaps: {
        ...(landState.landLocationMaps ?? {}),
        [compId]: landLocationSnapshot,
      },
    };

    const comparablesState = {
      ...baseProject.comparables,
      byType: {
        ...baseProject.comparables.byType,
        Land: updatedLandState,
      },
    };

    const snapshot: ProjectData = {
      subject,
      comparables: comparablesState,
      location: baseProject.location,
    };

    projectStoreRef.current[projectName] = snapshot;
    serializedProjectRef.current = snapshot;
  }, [
    bubblePosition,
    bubbleSize,
    circleRadius,
    circles,
    compId,
    hideUI,
    labelSize,
    mapCenter,
    mapZoom,
    markerPosition,
    polygonPath,
    projectName,
    propertyInfo,
    streetLabels,
    subjectPinnedTailTipPosition,
    tailDirection,
    isSubjectTailPinned,
  ]);

  const writeProjectsToStorage = useCallback((currentName: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projectStoreRef.current),
      );
      window.localStorage.setItem(
        CURRENT_PROJECT_STORAGE_KEY,
        currentName,
      );
    } catch (error) {
      console.error("Failed to save projects", error);
    }
  }, []);

  const handleProjectNameEdit = useCallback(() => {
    if (typeof window === "undefined") return;
    const input = window
      .prompt("Rename project", projectName)
      ?.trim();
    if (!input || input === projectName) return;

    if (projectStoreRef.current[input]) {
      window.alert("A project with that name already exists. Choose another name.");
      return;
    }

    persistCurrentProjectState();

    const updatedStore: ProjectsMap = {};
    Object.entries(projectStoreRef.current).forEach(([name, state]) => {
      updatedStore[name === projectName ? input : name] = state;
    });

    projectStoreRef.current = updatedStore;
    setProjectName(input);
    writeProjectsToStorage(input);
  }, [persistCurrentProjectState, projectName, writeProjectsToStorage]);

  const handleProjectSwitch = useCallback(() => {
    if (typeof window === "undefined") return;
    const names = Object.keys(projectStoreRef.current);
    const suggestion =
      names.find((name) => name !== projectName) ?? getNextProjectName(names);
    const input = window
      .prompt(
        names.length
          ? `Enter project name to switch to (existing names):\n${names.join(
              "\n",
            )}\n\nTo create a new project, enter a new name.`
          : "Enter project name to create",
        suggestion,
      )
      ?.trim();

    if (!input || input === projectName) return;

    persistCurrentProjectState();

    if (!projectStoreRef.current[input]) {
      projectStoreRef.current[input] = createDefaultProject();
    }

    const targetProject = projectStoreRef.current[input];
    setProjectName(input);
    applyProjectState(targetProject);
    writeProjectsToStorage(input);
  }, [
    applyProjectState,
    persistCurrentProjectState,
    projectName,
    writeProjectsToStorage,
  ]);

  useEffect(() => {
    if (!isStateHydrated) return;
    if (typeof window === "undefined") return;
    if (!projectName) return;

    const saveToLocalStorage = () => {
      persistCurrentProjectState();
      writeProjectsToStorage(projectName);
    };

    saveToLocalStorage();
    const intervalId = window.setInterval(saveToLocalStorage, 30000);

    const handleBeforeUnload = () => {
      saveToLocalStorage();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [
    isStateHydrated,
    persistCurrentProjectState,
    projectName,
    writeProjectsToStorage,
  ]);

  const handleShare = useCallback(async () => {
    if (typeof window === "undefined" || !compId) return;
    persistCurrentProjectState();
    writeProjectsToStorage(projectName);
    const projectSnapshot =
      serializedProjectRef.current ?? projectStoreRef.current[projectName];
    const encoded = encodeState(projectSnapshot);
    if (!encoded) {
      window.alert("Unable to generate share link. Please try again.");
      return;
    }

    if (encoded.length > MAX_URL_STATE_LENGTH) {
      window.alert(
        "Map state is too large to share via URL. Please simplify the map and try again.",
      );
      return;
    }

    const url = new URL(`${window.location.origin}/land-comp-map`);
    url.searchParams.set("project", projectName);
    url.searchParams.set("compId", compId);
    url.searchParams.set("mapState", encoded);

    try {
      await navigator.clipboard.writeText(url.toString());
      window.alert("Shareable land comp map link copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy share link", error);
      window.prompt("Copy this share link", url.toString());
    }
  }, [compId, persistCurrentProjectState, projectName, writeProjectsToStorage]);

  const handleAddressSearch = useCallback(
    async (address: string) => {
      if (!address.trim()) return;

      try {
        const geocoder = new google.maps.Geocoder();
        const results = await new Promise<google.maps.GeocoderResult[]>(
          (resolve, reject) => {
            geocoder.geocode({ address }, (res, status) => {
              if (status === "OK" && res) {
                resolve(res);
              } else {
                reject(new Error(`Geocoding failed: ${status}`));
              }
            });
          },
        );

        if (results.length === 0) {
          window.alert("No results found for that address.");
          return;
        }

        const location = results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();

        const newMarker = { lat, lng };
        setMarkerPosition(newMarker);
        setBubblePosition({ lat: lat + 0.001, lng: lng + 0.001 });
        setMapCenter({ lat, lng });
        setMapZoom(17);
        if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
          setSubjectPinnedTailTipPosition(newMarker);
        }

        setPropertyInfo((prev) => ({
          ...prev,
          address,
          addressForDisplay:
            prev.addressForDisplay && prev.addressForDisplay !== prev.address
              ? prev.addressForDisplay
              : address,
        }));
      } catch (error) {
        console.error("Failed to geocode address", error);
        window.alert("Failed to geocode address. Please try again.");
      }
    },
    [isSubjectTailPinned, subjectPinnedTailTipPosition],
  );

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (isRepositioningSubjectTail) {
        setSubjectPinnedTailTipPosition({ lat, lng });
        setIsRepositioningSubjectTail(false);
        setIsSubjectTailPinned(true);
        return;
      }

      if (isDrawingCircle) {
        const newCircle: Circle = {
          center: { lat, lng },
          radius: circleRadius * 1609.34,
          id: `circle-${Date.now()}-${Math.random()}`,
        };
        setCircles((prev) => [...prev, newCircle]);
        return;
      }

      if (isDrawing) {
        setPolygonPath((prev) => [...prev, { lat, lng }]);
        return;
      }

      if (!markerPositionRef.current) {
        setMarkerPosition({ lat, lng });
        setBubblePosition({ lat: lat + 0.001, lng: lng + 0.001 });
        if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
          setSubjectPinnedTailTipPosition({ lat, lng });
        }
      }
    },
    [
      circleRadius,
      isDrawing,
      isDrawingCircle,
      isRepositioningSubjectTail,
      isSubjectTailPinned,
      subjectPinnedTailTipPosition,
    ],
  );

  const activeComparableLabel = useMemo(() => {
    if (!comparable) return "Land Comparable";
    if (comparable.addressForDisplay) return comparable.addressForDisplay;
    if (comparable.address) return comparable.address;
    return "Land Comparable";
  }, [comparable]);

  if (!compId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-700">
            Missing <code>compId</code> query parameter. Use the Projects page or the
            Comparables Map to open a land comparable map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full">
      <PropertyInfoPanel
        heading="Land Comparable Map"
        projectName={projectName}
        onProjectNameEdit={handleProjectNameEdit}
        onProjectSwitch={handleProjectSwitch}
        propertyInfo={propertyInfo}
        onPropertyInfoChange={setPropertyInfo}
        onAddressSearch={handleAddressSearch}
        bubbleSize={bubbleSize}
        onBubbleSizeChange={setBubbleSize}
        tailDirection={tailDirection}
        onTailDirectionChange={setTailDirection}
        hideUI={hideUI}
        onHideUIChange={setHideUI}
        isTailPinned={isSubjectTailPinned}
        onIsTailPinnedChange={setIsSubjectTailPinned}
        pinnedTailTipPosition={subjectPinnedTailTipPosition}
        onPinnedTailTipPositionChange={setSubjectPinnedTailTipPosition}
        isRepositioningTail={isRepositioningSubjectTail}
        onIsRepositioningTailChange={setIsRepositioningSubjectTail}
        streetLabels={streetLabels}
        onStreetLabelsChange={setStreetLabels}
        labelSize={labelSize}
        onLabelSizeChange={setLabelSize}
        mapCenter={mapCenter}
        onShare={handleShare}
      />

      <div className="relative flex-1">
        {loadError && (
          <div className="absolute inset-x-0 top-4 z-20 mx-auto w-[420px] rounded-md border border-yellow-500 bg-yellow-50 p-4 text-sm text-yellow-800 shadow-lg">
            {loadError}
          </div>
        )}

        <APIProvider
          apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          libraries={["drawing"]}
        >
          <Map
            center={mapCenter}
            zoom={mapZoom}
            mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
            disableDefaultUI={hideUI}
            onCenterChanged={(event) => {
              const center = event.detail.center;
              if (center) {
                setMapCenter({ lat: center.lat, lng: center.lng });
              }
            }}
            onZoomChanged={(event) => {
              const zoom = event.detail.zoom;
              if (zoom) {
                setMapZoom(zoom);
              }
            }}
            onClick={(event) => {
              if (event.detail.latLng) {
                handleMapClick(
                  event.detail.latLng.lat,
                  event.detail.latLng.lng,
                );
              }
            }}
          >
            {markerPosition && !hideUI && (
              <AdvancedMarker
                position={markerPosition}
                draggable
                onDragEnd={(event) => {
                  if (event.latLng) {
                    const lat = event.latLng.lat();
                    const lng = event.latLng.lng();
                    const newPosition = { lat, lng };
                    setMarkerPosition(newPosition);
                    if (!bubblePositionRef.current) {
                      setBubblePosition({ lat: lat + 0.001, lng: lng + 0.001 });
                    }
                    if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
                      setSubjectPinnedTailTipPosition(newPosition);
                    }
                  }
                }}
              >
                <div className="h-4 w-4 rounded-full border-2 border-white bg-red-600 shadow-lg" />
              </AdvancedMarker>
            )}

            {bubblePosition && (
              <SubjectLocationMarker
                position={bubblePosition}
                markerPosition={markerPosition ?? undefined}
                propertyInfo={{
                  address: activeComparableLabel,
                  legalDescription: propertyInfo.legalDescription ?? "",
                  acres: propertyInfo.acres ?? "",
                }}
                onPositionChange={(next) => setBubblePosition(next)}
                sizeMultiplier={bubbleSize}
                tailDirection={tailDirection}
                isTailPinned={isSubjectTailPinned}
                pinnedTailTipPosition={subjectPinnedTailTipPosition}
              />
            )}

            {isSubjectTailPinned &&
              subjectPinnedTailTipPosition &&
              bubblePosition && (
                <PinnedTailOverlay
                  bubblePosition={bubblePosition}
                  pinnedTailTipPosition={subjectPinnedTailTipPosition}
                  bubbleWidth={400 * bubbleSize}
                  bubbleHeight={200 * bubbleSize}
                  color="#ffffff"
                  strokeColor="#000000"
                />
              )}

            {streetLabels.map((label) => (
              <StreetLabel
                key={label.id}
                position={label.position}
                text={label.text}
                rotation={label.rotation}
                onPositionChange={(position) => {
                  setStreetLabels((prev) =>
                    prev.map((entry) =>
                      entry.id === label.id ? { ...entry, position } : entry,
                    ),
                  );
                }}
                onRotationChange={(rotation) => {
                  setStreetLabels((prev) =>
                    prev.map((entry) =>
                      entry.id === label.id ? { ...entry, rotation } : entry,
                    ),
                  );
                }}
                onTextChange={(text) => {
                  setStreetLabels((prev) =>
                    prev.map((entry) =>
                      entry.id === label.id ? { ...entry, text } : entry,
                    ),
                  );
                }}
                isEditing={label.isEditing}
                onEditToggle={() => {
                  setStreetLabels((prev) =>
                    prev.map((entry) =>
                      entry.id === label.id
                        ? { ...entry, isEditing: !entry.isEditing }
                        : entry,
                    ),
                  );
                }}
                hideUI={hideUI}
                sizeMultiplier={labelSize}
              />
            ))}

            <PolygonDrawingTool
              isDrawing={isDrawing}
              onIsDrawingChange={setIsDrawing}
              polygonPath={polygonPath}
              onPolygonPathChange={setPolygonPath}
            />

            <CircleDrawingTool circles={circles} onCirclesChange={setCircles} />
          </Map>
        </APIProvider>

        {!hideUI && (
          <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsDrawing(!isDrawing);
                  setIsDrawingCircle(false);
                }}
                className={`rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors ${
                  isDrawing ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
                }`}
                title="Draw a polygon shape"
              >
                {isDrawing ? "Finish Drawing" : "Draw Polygon"}
              </button>
              <div className="relative flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsDrawingCircle(!isDrawingCircle);
                    setIsDrawing(false);
                  }}
                  className={`rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors ${
                    isDrawingCircle
                      ? "border-blue-500 bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                  title="Draw a circle"
                >
                  Draw Circle
                </button>
                {isDrawingCircle && (
                  <select
                    value={circleRadius}
                    onChange={(event) =>
                      setCircleRadius(Number(event.target.value) as 1 | 2 | 3 | 5)
                    }
                    className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm shadow-lg transition-colors hover:bg-gray-50 focus:border-blue-500 focus:outline-none"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <option value={1}>1 mile</option>
                    <option value={2}>2 miles</option>
                    <option value={3}>3 miles</option>
                    <option value={5}>5 miles</option>
                  </select>
                )}
              </div>
            </div>
            {polygonPath.length > 0 && (
              <button
                onClick={() => setPolygonPath([])}
                className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors hover:border-red-500 hover:bg-red-50"
              >
                Clear Polygon
              </button>
            )}
            {circles.length > 0 && (
              <button
                onClick={() => setCircles([])}
                className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors hover:border-red-500 hover:bg-red-50"
              >
                Clear Circles
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

