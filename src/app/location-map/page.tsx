"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { env } from "~/env";
import { SubjectLocationMarker } from "~/components/SubjectLocationMarker";
import { PolygonDrawingTool } from "~/components/PolygonDrawingTool";
import { CircleDrawingTool } from "~/components/CircleDrawingTool";
import { PropertyInfoPanel } from "~/components/PropertyInfoPanel";
import { StreetLabel } from "~/components/StreetLabel";
import { PinnedTailOverlay } from "~/components/PinnedTailOverlay";
import { DocumentOverlay } from "~/components/DocumentOverlay";
import { useSearchParams } from "next/navigation";
import {
  encodeState,
  decodeState,
  MAX_URL_STATE_LENGTH,
} from "~/utils/statePersistence";
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
  COMPARABLE_TYPES,
} from "~/utils/projectStore";
import type {
  ComparablesMapState,
  ComparableType,
  LocationMapState,
  ProjectData,
  ProjectsMap,
  ProjectSubjectState,
  SubjectInfo,
  StreetLabelData,
  Circle,
  PolygonPath,
} from "~/utils/projectStore";

type PropertyInfo = SubjectInfo;

export default function LocationMapPage() {
  const searchParams = useSearchParams();
  const projectStoreRef = useRef<ProjectsMap>({});
  const [projectName, setProjectName] = useState("Project 1");
  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo>({
    address: "",
    addressForDisplay: "",
    legalDescription: "",
    acres: "",
  });
  const [markerPosition, setMarkerPosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [bubblePosition, setBubblePosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [polygonPath, setPolygonPath] = useState<PolygonPath[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingCircle, setIsDrawingCircle] = useState(false);
  const [circleRadius, setCircleRadius] = useState<1 | 2 | 3 | 5>(
    DEFAULT_CIRCLE_RADIUS,
  ); // Default radius in meters
  const [circles, setCircles] = useState<Circle[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(
    () => ({
      ...DEFAULT_MAP_CENTER,
    }),
  );
  const [mapZoom, setMapZoom] = useState(17);
  const [bubbleSize, setBubbleSize] = useState(1.0); // 1.0 = 100% (400x200 base)
  const [tailDirection, setTailDirection] = useState<"left" | "right">("right");
  const [hideUI, setHideUI] = useState(false); // Screenshot mode
  const [showDocumentOverlay, setShowDocumentOverlay] = useState(false);
  const [isSubjectTailPinned, setIsSubjectTailPinned] = useState(true); // Enable tail pinning by default
  const [subjectPinnedTailTipPosition, setSubjectPinnedTailTipPosition] =
    useState<
      | {
          lat: number;
          lng: number;
        }
      | undefined
    >(undefined);
  const [isRepositioningSubjectTail, setIsRepositioningSubjectTail] =
    useState(false);
  const [streetLabels, setStreetLabels] = useState<StreetLabelData[]>([]);
  const [labelSize, setLabelSize] = useState(1.0); // 1.0 = 100% (36px base)
  const markerPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const bubblePositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const [isStateHydrated, setIsStateHydrated] = useState(false);
  const serializedProjectRef = useRef<ProjectData | null>(null);
  const applyProjectState = useCallback(
    (project?: ProjectData) => {
      const snapshot = normalizeProjectData(project);
      const subjectSnapshot = snapshot.subject;
      const locationSnapshot = snapshot.location;

      const infoSnapshot = subjectSnapshot.info;
      setPropertyInfo({
        address: infoSnapshot.address ?? "",
        addressForDisplay:
          infoSnapshot.addressForDisplay ?? infoSnapshot.address ?? "",
        legalDescription: infoSnapshot.legalDescription ?? "",
        acres: infoSnapshot.acres ?? "",
      });
      setMarkerPosition(
        subjectSnapshot.markerPosition
          ? { ...subjectSnapshot.markerPosition }
          : null,
      );
      setBubblePosition(
        subjectSnapshot.bubblePosition
          ? { ...subjectSnapshot.bubblePosition }
          : null,
      );
      setPolygonPath(
        locationSnapshot.polygonPath
          ? locationSnapshot.polygonPath.map((point) => ({ ...point }))
          : [],
      );
      setCircles(
        locationSnapshot.circles
          ? locationSnapshot.circles.map((circle) => ({
              ...circle,
              center: { ...circle.center },
            }))
          : [],
      );
      setMapCenter(
        locationSnapshot.mapCenter
          ? { ...locationSnapshot.mapCenter }
          : { ...DEFAULT_MAP_CENTER },
      );
      setMapZoom(locationSnapshot.mapZoom ?? 17);
      setBubbleSize(locationSnapshot.bubbleSize ?? 1.0);
      setTailDirection(locationSnapshot.tailDirection ?? "right");
      setHideUI(locationSnapshot.hideUI ?? false);
      setIsSubjectTailPinned(subjectSnapshot.isTailPinned ?? true);
      setSubjectPinnedTailTipPosition(
        subjectSnapshot.pinnedTailTipPosition ?? undefined,
      );
      setStreetLabels(
        locationSnapshot.streetLabels
          ? locationSnapshot.streetLabels.map((label) => ({
              ...label,
              position: { ...label.position },
            }))
          : [],
      );
      setLabelSize(locationSnapshot.labelSize ?? DEFAULT_LABEL_SIZE);
      setCircleRadius(locationSnapshot.circleRadius ?? DEFAULT_CIRCLE_RADIUS);
      setIsDrawing(false);
      setIsDrawingCircle(false);
      setIsRepositioningSubjectTail(false);
    },
    [
      setPropertyInfo,
      setMarkerPosition,
      setBubblePosition,
      setPolygonPath,
      setCircles,
      setMapCenter,
      setMapZoom,
      setBubbleSize,
      setTailDirection,
      setHideUI,
      setIsSubjectTailPinned,
      setSubjectPinnedTailTipPosition,
      setStreetLabels,
      setLabelSize,
      setCircleRadius,
      setIsDrawing,
      setIsDrawingCircle,
      setIsRepositioningSubjectTail,
    ],
  );

  // Sync refs with state
  useEffect(() => {
    markerPositionRef.current = markerPosition;
  }, [markerPosition]);

  useEffect(() => {
    bubblePositionRef.current = bubblePosition;
  }, [bubblePosition]);

  // Hydrate state from URL or localStorage
  useEffect(() => {
    if (isStateHydrated) return;
    if (typeof window === "undefined") return;

    let projectStore: ProjectsMap = {};
    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<
          string,
          Partial<ProjectData>
        >;
        projectStore = normalizeProjectsMap(parsed);
      } catch (error) {
        console.error("Failed to parse stored projects", error);
      }
    }

    let selectedProjectName =
      window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY) ?? undefined;

    const encodedFromUrl = searchParams.get("mapState");
    if (encodedFromUrl) {
      const decoded = decodeState<ProjectData>(encodedFromUrl);
      if (decoded) {
        const normalized = normalizeProjectData(decoded);
        const newProjectName = getNextProjectName(Object.keys(projectStore));
        projectStore[newProjectName] = normalized;
        selectedProjectName = newProjectName;
      }
    }

    const projectKeys = Object.keys(projectStore);
    if (!selectedProjectName || !projectStore[selectedProjectName]) {
      if (projectKeys.length > 0) {
        selectedProjectName = projectKeys[0];
      } else {
        const defaultName = getNextProjectName([]);
        projectStore[defaultName] = createDefaultProject();
        selectedProjectName = defaultName;
      }
    }

    const finalProjectName = selectedProjectName as string;

    projectStoreRef.current = projectStore;
    setProjectName(finalProjectName);
    applyProjectState(projectStore[finalProjectName]);

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
  }, [applyProjectState, isStateHydrated, searchParams]);

  const persistCurrentProjectState = useCallback(() => {
    if (!projectName) return;
    const baseProject = projectStoreRef.current[projectName]
      ? normalizeProjectData(projectStoreRef.current[projectName])
      : createDefaultProject();

    const subject: ProjectSubjectState = {
      info: {
        address: propertyInfo.address ?? "",
        addressForDisplay:
          propertyInfo.addressForDisplay ?? propertyInfo.address ?? "",
        legalDescription: propertyInfo.legalDescription ?? "",
        acres: propertyInfo.acres ?? "",
      },
      markerPosition: markerPosition ? { ...markerPosition } : null,
      bubblePosition: bubblePosition ? { ...bubblePosition } : null,
      isTailPinned: isSubjectTailPinned,
      pinnedTailTipPosition: subjectPinnedTailTipPosition
        ? { ...subjectPinnedTailTipPosition }
        : null,
    };

    const locationState: LocationMapState = {
      ...baseProject.location,
      // propertyInfo removed - use subject.info instead
      markerPosition: subject.markerPosition,
      bubblePosition: subject.bubblePosition,
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
      // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
      streetLabels: streetLabels.map((label) => ({
        ...label,
        position: { ...label.position },
      })),
      labelSize,
      circleRadius,
    };

    const comparablesByType = COMPARABLE_TYPES.reduce<
      Record<ComparableType, ComparablesMapState>
    >(
      (acc, type) => {
        const currentState =
          baseProject.comparables.byType[type] ??
          createDefaultProject().comparables.byType[type];
        acc[type] = {
          ...currentState,
          // subjectInfo removed - use subject.info instead
          subjectMarkerPosition: subject.markerPosition,
          subjectBubblePosition: subject.bubblePosition,
          // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
        };
        return acc;
      },
      {} as Record<ComparableType, ComparablesMapState>,
    );

    const comparablesState = {
      activeType: baseProject.comparables.activeType,
      byType: comparablesByType,
    };

    const snapshot: ProjectData = {
      ...baseProject, // Preserve all top-level fields (subjectPhotosFolderId, projectFolderId, clientCompany, etc.)
      subject,
      location: locationState,
      comparables: comparablesState,
    };

    projectStoreRef.current[projectName] = snapshot;
    serializedProjectRef.current = snapshot;
  }, [
    bubblePosition,
    circleRadius,
    circles,
    hideUI,
    isSubjectTailPinned,
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
    bubbleSize,
  ]);

  const writeProjectsToStorage = useCallback((currentName: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projectStoreRef.current),
      );
      window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, currentName);
    } catch (error) {
      console.error("Failed to save location map projects", error);
    }
  }, []);

  const handleProjectNameEdit = useCallback(() => {
    if (typeof window === "undefined") return;
    const input = window.prompt("Rename project", projectName)?.trim();
    if (!input || input === projectName) return;

    if (projectStoreRef.current[input]) {
      window.alert(
        "A project with that name already exists. Choose another name.",
      );
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
    if (typeof window === "undefined") return;
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

    const url = new URL(window.location.href);
    url.searchParams.set("mapState", encoded);

    try {
      await navigator.clipboard.writeText(url.toString());
      window.alert(`Shareable link for ${projectName} copied to clipboard!`);
    } catch (error) {
      console.error("Failed to copy share link", error);
      window.prompt("Copy this share link", url.toString());
    }
  }, [persistCurrentProjectState, projectName, writeProjectsToStorage]);

  // Handle address search
  const handleAddressSearch = async (address: string) => {
    if (!address.trim()) return;

    try {
      const geocoder = new google.maps.Geocoder();
      const results = await new Promise<google.maps.GeocoderResult[]>(
        (resolve, reject) => {
          geocoder.geocode({ address }, (results, status) => {
            if (status === "OK" && results) {
              resolve(results);
            } else {
              reject(new Error(`Geocoding failed: ${status}`));
            }
          });
        },
      );

      if (results && results.length > 0) {
        const location = results[0]!.geometry.location;
        const formattedAddress = results[0]?.formatted_address ?? address;
        const newPosition = {
          lat: location.lat(),
          lng: location.lng(),
        };
        setMapCenter(newPosition);
        setMarkerPosition(newPosition);
        // Set bubble position slightly offset from marker
        setBubblePosition({
          lat: newPosition.lat + 0.001,
          lng: newPosition.lng + 0.001,
        });
        // Set default pinned tail tip position if pinned but not set yet
        if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
          setSubjectPinnedTailTipPosition(newPosition);
        }
        setMapZoom(18);
        setPropertyInfo((prev) => {
          const keepDisplay =
            prev.addressForDisplay &&
            prev.addressForDisplay.trim().length > 0 &&
            prev.addressForDisplay !== prev.address;
          return {
            ...prev,
            address: formattedAddress,
            addressForDisplay: keepDisplay
              ? prev.addressForDisplay
              : formattedAddress,
          };
        });
      }
    } catch (error) {
      console.error("Error geocoding address:", error);
    }
  };

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar for property information */}
      <PropertyInfoPanel
        projectName={projectName}
        propertyInfo={propertyInfo}
        onPropertyInfoChange={setPropertyInfo}
        onAddressSearch={handleAddressSearch}
        bubbleSize={bubbleSize}
        onBubbleSizeChange={setBubbleSize}
        tailDirection={tailDirection}
        onTailDirectionChange={setTailDirection}
        hideUI={hideUI}
        onHideUIChange={setHideUI}
        showDocumentOverlay={showDocumentOverlay}
        onShowDocumentOverlayChange={setShowDocumentOverlay}
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

      {/* Map container */}
      <div className="relative flex-1">
        <APIProvider
          apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          libraries={["drawing"]}
        >
          <Map
            center={mapCenter}
            zoom={mapZoom}
            mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
            disableDefaultUI={hideUI}
            onCenterChanged={(e) => {
              const center = e.detail.center;
              if (center) {
                setMapCenter({ lat: center.lat, lng: center.lng });
              }
            }}
            onZoomChanged={(e) => {
              const zoom = e.detail.zoom;
              if (zoom) {
                setMapZoom(zoom);
              }
            }}
            onClick={(e) => {
              if (e.detail.latLng) {
                const lat = e.detail.latLng.lat;
                const lng = e.detail.latLng.lng;

                // If repositioning subject tail, place or reposition the tail tip
                if (isRepositioningSubjectTail) {
                  setSubjectPinnedTailTipPosition({ lat, lng });
                  setIsRepositioningSubjectTail(false);
                  setIsSubjectTailPinned(true);
                  return;
                }

                // If circle drawing mode is active, create a circle
                if (isDrawingCircle) {
                  const newCircle: Circle = {
                    center: { lat, lng },
                    radius: circleRadius * 1609.34, // Convert miles to meters
                    id: `circle-${Date.now()}-${Math.random()}`,
                  };
                  setCircles((prev) => [...prev, newCircle]);
                } else if (isDrawing) {
                  // If polygon drawing mode is active, add point to polygon
                  setPolygonPath((prev) => [...prev, { lat, lng }]);
                } else if (!markerPosition) {
                  // Otherwise, set marker if not set
                  setMarkerPosition({ lat, lng });
                  setBubblePosition({ lat: lat + 0.001, lng: lng + 0.001 });
                  // Set default pinned tail tip position if pinned but not set yet
                  if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
                    setSubjectPinnedTailTipPosition({ lat, lng });
                  }
                }
              }
            }}
          >
            {/* Polygon Drawing Tool */}
            <PolygonDrawingTool
              isDrawing={isDrawing}
              onIsDrawingChange={setIsDrawing}
              polygonPath={polygonPath}
              onPolygonPathChange={setPolygonPath}
            />

            {/* Circle Drawing Tool */}
            <CircleDrawingTool circles={circles} onCirclesChange={setCircles} />

            {/* Subject marker */}
            {markerPosition && !hideUI && (
              <AdvancedMarker
                position={markerPosition}
                draggable
                onDragEnd={(e) => {
                  if (e.latLng) {
                    const newPosition = {
                      lat: e.latLng.lat(),
                      lng: e.latLng.lng(),
                    };

                    // Use refs to get current values synchronously
                    const currentMarkerPos = markerPositionRef.current;
                    const currentBubblePos = bubblePositionRef.current;

                    if (currentMarkerPos && currentBubblePos) {
                      // Calculate offset from current positions
                      const latDiff =
                        currentBubblePos.lat - currentMarkerPos.lat;
                      const lngDiff =
                        currentBubblePos.lng - currentMarkerPos.lng;

                      // Update both positions
                      setMarkerPosition(newPosition);
                      setBubblePosition({
                        lat: newPosition.lat + latDiff,
                        lng: newPosition.lng + lngDiff,
                      });
                    } else {
                      // Fallback if refs aren't set yet
                      setMarkerPosition(newPosition);
                    }
                  }
                }}
              >
                <div className="h-4 w-4 cursor-grab rounded-full border-2 border-white bg-red-600 shadow-lg active:cursor-grabbing" />
              </AdvancedMarker>
            )}

            {/* Pinned tail overlay for subject (drawn as polygon) */}
            {isSubjectTailPinned &&
              subjectPinnedTailTipPosition &&
              bubblePosition &&
              markerPosition && (
                <PinnedTailOverlay
                  bubblePosition={bubblePosition}
                  pinnedTailTipPosition={subjectPinnedTailTipPosition}
                  bubbleWidth={400 * bubbleSize}
                  bubbleHeight={200 * bubbleSize}
                  color="#ffffff"
                  strokeColor="#000000"
                />
              )}

            {/* Custom SVG bubble marker */}
            {bubblePosition && markerPosition && (
              <SubjectLocationMarker
                position={bubblePosition}
                markerPosition={markerPosition}
                propertyInfo={propertyInfo}
                onPositionChange={setBubblePosition}
                sizeMultiplier={bubbleSize}
                tailDirection={tailDirection}
                isTailPinned={isSubjectTailPinned}
                pinnedTailTipPosition={subjectPinnedTailTipPosition}
              />
            )}

            {/* Street Labels */}
            {streetLabels.map((label) => (
              <StreetLabel
                key={label.id}
                position={label.position}
                text={label.text}
                rotation={label.rotation}
                onPositionChange={(newPosition) => {
                  setStreetLabels((prev) =>
                    prev.map((l) =>
                      l.id === label.id ? { ...l, position: newPosition } : l,
                    ),
                  );
                }}
                onRotationChange={(newRotation) => {
                  setStreetLabels((prev) =>
                    prev.map((l) =>
                      l.id === label.id ? { ...l, rotation: newRotation } : l,
                    ),
                  );
                }}
                onTextChange={(newText) => {
                  setStreetLabels((prev) =>
                    prev.map((l) =>
                      l.id === label.id ? { ...l, text: newText } : l,
                    ),
                  );
                }}
                isEditing={label.isEditing}
                onEditToggle={() => {
                  setStreetLabels((prev) =>
                    prev.map((l) =>
                      l.id === label.id ? { ...l, isEditing: !l.isEditing } : l,
                    ),
                  );
                }}
                hideUI={hideUI}
                sizeMultiplier={labelSize}
              />
            ))}
          </Map>
        </APIProvider>
        <DocumentOverlay enabled={showDocumentOverlay} />

        {/* Drawing controls */}
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
                    onChange={(e) =>
                      setCircleRadius(Number(e.target.value) as 1 | 2 | 3 | 5)
                    }
                    className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm shadow-lg transition-colors hover:bg-gray-50 focus:border-blue-500 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
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
