"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import "~/utils/injectCanvasHack";
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
import { useProject } from "~/hooks/useProject";
import {
  normalizeProjectData,
  DEFAULT_MAP_CENTER,
  DEFAULT_LABEL_SIZE,
  DEFAULT_CIRCLE_RADIUS,
  WELL_KNOWN_MAP_IDS,
  getMapByType,
  getSubjectMarker,
  updateMapInProject,
} from "~/utils/projectStore";
import type {
  ProjectData,
  SubjectInfo,
  StreetLabelData,
  Circle,
  PolygonPath,
  MapMarker,
} from "~/utils/projectStore";

type PropertyInfo = SubjectInfo;

const MAP_ID = WELL_KNOWN_MAP_IDS.neighborhood;

interface NeighborhoodMapPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function NeighborhoodMapPage({
  params,
}: NeighborhoodMapPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);

  const { project, isLoading, updateProject } = useProject(decodedProjectId);

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
    useState<{ lat: number; lng: number } | undefined>(undefined);
  const [isRepositioningSubjectTail, setIsRepositioningSubjectTail] =
    useState(false);
  const [streetLabels, setStreetLabels] = useState<StreetLabelData[]>([]);
  const [labelSize, setLabelSize] = useState(1.0);
  const markerPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const bubblePositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const [isStateHydrated, setIsStateHydrated] = useState(false);

  const applyProjectState = useCallback((project?: ProjectData) => {
    const snapshot = normalizeProjectData(project);
    const mapView = getMapByType(snapshot, "neighborhood");
    if (!mapView) return;

    const subjectMarker = getSubjectMarker(mapView);
    const infoSnapshot = snapshot.subject;

    setPropertyInfo({
      address: infoSnapshot.address ?? "",
      addressForDisplay:
        infoSnapshot.addressForDisplay ?? infoSnapshot.address ?? "",
      legalDescription: infoSnapshot.legalDescription ?? "",
      acres: infoSnapshot.acres ?? "",
    });
    setMarkerPosition(
      subjectMarker?.markerPosition
        ? { ...subjectMarker.markerPosition }
        : null,
    );
    setBubblePosition(
      subjectMarker?.bubblePosition
        ? { ...subjectMarker.bubblePosition }
        : null,
    );
    setPolygonPath(mapView.drawings.polygonPath.map((point) => ({ ...point })));
    setCircles(
      mapView.drawings.circles.map((circle) => ({
        ...circle,
        center: { ...circle.center },
      })),
    );
    setMapCenter(
      mapView.mapCenter ? { ...mapView.mapCenter } : { ...DEFAULT_MAP_CENTER },
    );
    setMapZoom(mapView.mapZoom);
    setBubbleSize(mapView.bubbleSize);
    setTailDirection(mapView.drawings.tailDirection);
    setHideUI(mapView.hideUI);
    setDocumentFrameSize(mapView.documentFrameSize);
    setIsSubjectTailPinned(subjectMarker?.isTailPinned ?? true);
    setSubjectPinnedTailTipPosition(
      subjectMarker?.pinnedTailTipPosition ?? undefined,
    );
    setStreetLabels(
      mapView.drawings.streetLabels.map((label) => ({
        ...label,
        position: { ...label.position },
      })),
    );
    setLabelSize(mapView.drawings.labelSize ?? DEFAULT_LABEL_SIZE);
    setCircleRadius(mapView.drawings.circleRadius);
    setIsDrawing(false);
    setIsDrawingCircle(false);
    setIsRepositioningSubjectTail(false);
  }, []);

  useEffect(() => {
    markerPositionRef.current = markerPosition;
  }, [markerPosition]);

  useEffect(() => {
    bubblePositionRef.current = bubblePosition;
  }, [bubblePosition]);

  useEffect(() => {
    if (isStateHydrated) return;
    if (!project) return;

    applyProjectState(project);
    setIsStateHydrated(true);
  }, [applyProjectState, isStateHydrated, project]);

  const persistCurrentProjectState = useCallback(() => {
    updateProject((prev) => {
      const updatedSubject: SubjectInfo = {
        address: propertyInfo.address ?? "",
        addressForDisplay:
          propertyInfo.addressForDisplay ?? propertyInfo.address ?? "",
        legalDescription: propertyInfo.legalDescription ?? "",
        acres: propertyInfo.acres ?? "",
      };

      const subjectMarker: MapMarker = {
        id: `marker-subject-${MAP_ID}`,
        mapId: MAP_ID,
        markerPosition: markerPosition ? { ...markerPosition } : null,
        bubblePosition: bubblePosition ? { ...bubblePosition } : null,
        isTailPinned: isSubjectTailPinned,
        pinnedTailTipPosition: subjectPinnedTailTipPosition
          ? { ...subjectPinnedTailTipPosition }
          : null,
      };

      const updatedMaps = updateMapInProject(prev, MAP_ID, (m) => ({
        ...m,
        mapCenter: mapCenter ? { ...mapCenter } : { ...DEFAULT_MAP_CENTER },
        mapZoom,
        bubbleSize,
        hideUI,
        documentFrameSize,
        drawings: {
          polygonPath: polygonPath.map((p) => ({ ...p })),
          circles: circles.map((c) => ({ ...c, center: { ...c.center } })),
          polylines: m.drawings.polylines,
          streetLabels: streetLabels.map((l) => ({
            ...l,
            position: { ...l.position },
          })),
          labelSize,
          circleRadius,
          tailDirection,
        },
        markers: [subjectMarker],
      }));

      return {
        ...prev,
        subject: updatedSubject,
        maps: updatedMaps,
      };
    });
  }, [
    updateProject,
    bubblePosition,
    bubbleSize,
    circleRadius,
    circles,
    documentFrameSize,
    hideUI,
    isSubjectTailPinned,
    labelSize,
    mapCenter,
    mapZoom,
    markerPosition,
    polygonPath,
    propertyInfo,
    streetLabels,
    subjectPinnedTailTipPosition,
    tailDirection,
  ]);

  useEffect(() => {
    if (!isStateHydrated) return;

    const timeoutId = window.setTimeout(() => {
      persistCurrentProjectState();
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [isStateHydrated, persistCurrentProjectState]);

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

  const handleCaptureScreenshot = async () => {
    try {
      const { toPng } = await import("html-to-image");
      const container = document.getElementById("neighborhood-map-container");
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

      const dataUrl = await toPng(container, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "transparent",
        fontEmbedCSS: "",
      });

      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = docWidth * scale;
      canvas.height = docHeight * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(
        img,
        x * scale,
        y * scale,
        docWidth * scale,
        docHeight * scale,
        0,
        0,
        docWidth * scale,
        docHeight * scale,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Failed to create image blob");

      try {
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        if ((window as any).showSaveFilePicker) {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: "neighborhood.png",
            types: [
              {
                description: "PNG Image",
                accept: { "image/png": [".png"] },
              },
            ],
          });
          const stream = await handle.createWritable();
          await stream.write(blob);
          await stream.close();
        } else {
          throw new Error("File System Access API not supported");
        }
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;

        const croppedDataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = croppedDataUrl;
        link.download = "neighborhood.png";
        link.click();
      }
    } catch (error) {
      console.error("Screenshot failed:", error);
      alert("Failed to capture screenshot. Please try manually.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-lg text-gray-500">Loading project…</p>
      </div>
    );
  }

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
        heading="Neighborhood Map"
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
                onClick={() =>
                  setDocumentFrameSize(Math.max(0.5, documentFrameSize - 0.1))
                }
                className="h-8 w-8 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Decrease Frame Size"
              >
                -
              </button>
              <span className="min-w-[3ch] text-center text-sm">
                {Math.round(documentFrameSize * 100)}%
              </span>
              <button
                onClick={() =>
                  setDocumentFrameSize(Math.min(2.0, documentFrameSize + 0.1))
                }
                className="h-8 w-8 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Increase Frame Size"
              >
                +
              </button>
            </div>
          )}
        </div>
      )}

      <div id="neighborhood-map-container" className="relative flex-1">
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
        <DocumentOverlay
          enabled={showDocumentOverlay}
          size={documentFrameSize}
        />

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
