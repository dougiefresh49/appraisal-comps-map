"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { env } from "~/env";
import { SubjectLocationMarker } from "~/components/SubjectLocationMarker";
import { PolygonDrawingTool } from "~/components/PolygonDrawingTool";
import { CircleDrawingTool } from "~/components/CircleDrawingTool";
import { PropertyInfoPanel } from "~/components/PropertyInfoPanel";
import { StreetLabel } from "~/components/StreetLabel";
import { PinnedTailOverlay } from "~/components/PinnedTailOverlay";
import { DocumentOverlay } from "~/components/DocumentOverlay";
import { MapDrawingControls } from "~/components/MapDrawingControls";
import {
  createDefaultProject,
  normalizeProjectData,
  normalizeProjectsMap,
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

interface SubjectLocationMapPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function SubjectLocationMapPage({ params }: SubjectLocationMapPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);
  
  const projectStoreRef = useRef<ProjectsMap>({});
  const projectName = decodedProjectId;

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
  );
  const [circles, setCircles] = useState<Circle[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(
    () => ({
      ...DEFAULT_MAP_CENTER,
    }),
  );
  const [mapZoom, setMapZoom] = useState(17);
  const [documentFrameSize, setDocumentFrameSize] = useState(1.0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [bubbleSize, setBubbleSize] = useState(1.0);
  const [tailDirection, setTailDirection] = useState<"left" | "right">("right");
  const [hideUI, setHideUI] = useState(false);
  const [showDocumentOverlay, setShowDocumentOverlay] = useState(false);
  const [isSubjectTailPinned, setIsSubjectTailPinned] = useState(true);
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
  const [labelSize, setLabelSize] = useState(1.0);
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

  // Hydrate state
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

    if (!projectStore[projectName]) {
        console.warn(`Project ${projectName} not found in storage, creating default.`);
        projectStore[projectName] = createDefaultProject();
    }

    projectStoreRef.current = projectStore;
    applyProjectState(projectStore[projectName]);

    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projectStore),
      );
      window.localStorage.setItem(
        CURRENT_PROJECT_STORAGE_KEY,
        projectName,
      );
    } catch (error) {
      console.error("Failed to persist projects", error);
    }

    setIsStateHydrated(true);
  }, [applyProjectState, isStateHydrated, projectName]);

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
          subjectMarkerPosition: subject.markerPosition,
          subjectBubblePosition: subject.bubblePosition,
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
      ...baseProject,
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



  const handleAddressSearch = async (address: string) => {
    if (!address.trim()) return;

    try {
      const geocoder = new google.maps.Geocoder();
      const results = await new Promise<google.maps.GeocoderResult[]>(
        (resolve, reject) => {
          void geocoder.geocode({ address }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results) {
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
        setBubblePosition({
          lat: newPosition.lat + 0.001,
          lng: newPosition.lng + 0.001,
        });
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

  // Placeholder - will use dynamic import for html-to-image to avoid SSR issues
  const handleCaptureScreenshot = async () => {
    try {
      const { toPng } = await import("html-to-image");
      const container = document.getElementById("location-map-container");
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      const documentAspectRatio = 8.5 / 11;
      const sizeMultiplier = documentFrameSize;

      let docWidth = containerWidth * 0.9 * sizeMultiplier;
      let docHeight = docWidth / documentAspectRatio;

      if (docHeight > containerHeight * 0.9 * sizeMultiplier) {
        docHeight = containerHeight * 0.9 * sizeMultiplier;
        docWidth = docHeight * documentAspectRatio;
      }

      const x = (containerWidth - docWidth) / 2;
      const y = (containerHeight - docHeight) / 2;
      
      // Capture the entire map container first
      // We use pixelRatio: 2 for better quality (simulating 2x scale)
      // fontEmbedCSS: "" avoids CORS issues with Google Fonts by skipping font embedding
      const dataUrl = await toPng(container, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "transparent",
        fontEmbedCSS: "",
      });

      // Now crop the image using a temporary canvas
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const canvas = document.createElement("canvas");
      // Current pixelRatio used in capture was 2, so dimensions are doubled
      const scale = 2;
      canvas.width = docWidth * scale;
      canvas.height = docHeight * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw the portion of the image that corresponds to the crop area
      // sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight
      ctx.drawImage(
        img, 
        x * scale, 
        y * scale, 
        docWidth * scale, 
        docHeight * scale, 
        0, 
        0, 
        docWidth * scale, 
        docHeight * scale
      );

      // Convert canvas to blob for File System Access API
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Failed to create image blob");

      try {
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        if ((window as any).showSaveFilePicker) {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: "subject-location-map.png",
                types: [{
                    description: 'PNG Image',
                    accept: { 'image/png': ['.png'] },
                }],
            });
            const stream = await handle.createWritable();
            await stream.write(blob);
            await stream.close();
        } else {
            throw new Error("File System Access API not supported");
        }
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      } catch (err: unknown) {
        // If user cancelled the picker, do nothing
        if (err instanceof Error && err.name === 'AbortError') return;

        // Fallback or error handling
        if (err instanceof Error && err.message === "File System Access API not supported") {
             const croppedDataUrl = canvas.toDataURL("image/png");
             const link = document.createElement("a");
             link.href = croppedDataUrl;
             link.download = "subject-location-map.png";
             link.click();
        } else {
            console.error("Screenshot save failed:", err);
            // Attempt fallback download even if picker failed for other reasons
             const croppedDataUrl = canvas.toDataURL("image/png");
             const link = document.createElement("a");
             link.href = croppedDataUrl;
             link.download = "subject-location-map.png";
             link.click();
        }
      }

    } catch (error) {
      console.error("Screenshot failed:", error);
      alert("Failed to capture screenshot. Please try manually.");
    }
  };

  return (
    <div className="flex h-screen w-full">
      <PropertyInfoPanel
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
        heading="Subject Location Map"
        isCollapsed={isCollapsed}
        onIsCollapsedChange={setIsCollapsed}
        mapCenter={mapCenter}
        documentFrameSize={documentFrameSize}
        onDocumentFrameSizeChange={setDocumentFrameSize}
        onCaptureScreenshot={handleCaptureScreenshot}
      />

      {isCollapsed && !hideUI && (
        <div className="absolute bottom-6 left-16 z-[70] flex flex-col gap-2 rounded-lg bg-white p-2 shadow-lg dark:bg-gray-800">
           <button
              onClick={() => setHideUI(!hideUI)}
              className="rounded-md border border-gray-300 p-2 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
              title="Toggle UI Visibility"
            >
              {hideUI ? "Show UI" : "Hide UI"}
           </button>
           
           {showDocumentOverlay && (
             <div className="flex items-center gap-2 rounded-md border border-gray-300 p-1 dark:border-gray-600">
                <button
                    onClick={() => setDocumentFrameSize(Math.max(0.5, documentFrameSize - 0.1))}
                    className="h-8 w-8 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Decrease Frame Size"
                >
                    -
                </button>
                <span className="min-w-[3ch] text-center text-sm">{Math.round(documentFrameSize * 100)}%</span>
                <button
                    onClick={() => setDocumentFrameSize(Math.min(2.0, documentFrameSize + 0.1))}
                    className="h-8 w-8 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Increase Frame Size"
                >
                    +
                </button>
             </div>
           )}
        </div>
      )}

      <div id="location-map-container" className="relative flex-1">
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
                } else if (isDrawing) {
                  setPolygonPath((prev) => [...prev, { lat, lng }]);
                } else if (!markerPosition) {
                  setMarkerPosition({ lat, lng });
                  setBubblePosition({ lat: lat + 0.001, lng: lng + 0.001 });
                  if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
                    setSubjectPinnedTailTipPosition({ lat, lng });
                  }
                }
              }
            }}
          >
            <PolygonDrawingTool
              isDrawing={isDrawing}
              onIsDrawingChange={setIsDrawing}
              polygonPath={polygonPath}
              onPolygonPathChange={setPolygonPath}
              hideUI={hideUI}
            />

            <CircleDrawingTool circles={circles} />

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

                    const currentMarkerPos = markerPositionRef.current;
                    const currentBubblePos = bubblePositionRef.current;

                    if (currentMarkerPos && currentBubblePos) {
                      const latDiff =
                        currentBubblePos.lat - currentMarkerPos.lat;
                      const lngDiff =
                        currentBubblePos.lng - currentMarkerPos.lng;

                      setMarkerPosition(newPosition);
                      setBubblePosition({
                        lat: newPosition.lat + latDiff,
                        lng: newPosition.lng + lngDiff,
                      });
                    } else {
                      setMarkerPosition(newPosition);
                    }
                  }
                }}
              >
                <div className="h-4 w-4 cursor-grab rounded-full border-2 border-white bg-red-600 shadow-lg active:cursor-grabbing" />
              </AdvancedMarker>
            )}

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
        <DocumentOverlay enabled={showDocumentOverlay} size={documentFrameSize} />

        <MapDrawingControls
          isDrawing={isDrawing}
          onIsDrawingChange={setIsDrawing}
          isDrawingCircle={isDrawingCircle}
          onIsDrawingCircleChange={setIsDrawingCircle}
          circleRadius={circleRadius}
          onCircleRadiusChange={setCircleRadius}
          polygonPath={polygonPath}
          onClearPolygon={() => setPolygonPath([])}
          circles={circles}
          onClearCircles={() => setCircles([])}
          hideUI={hideUI}
        />
      </div>
    </div>
  );
}
