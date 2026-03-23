"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import "~/utils/injectCanvasHack"; // Inject WebGL preserveDrawingBuffer hack
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
import { GisOverlay } from "~/components/GisOverlay";
import { useProject } from "~/hooks/useProject";

import {
  normalizeProjectData,
  DEFAULT_MAP_CENTER,
  DEFAULT_CIRCLE_RADIUS,
  compLocationMapId,
  ensureCompLocationMap,
  getCompMarker,
} from "~/utils/projectStore";
import type {
  MapMarker,
  MapView,
  ProjectData,
  SubjectInfo,
  StreetLabelData,
  Circle,
  PolygonPath,
} from "~/utils/projectStore";

type PropertyInfo = SubjectInfo;

interface SalesCompLocationMapPageProps {
  params: Promise<{
    projectId: string;
    compId: string;
  }>;
}

export default function SalesCompLocationMapPage({ params }: SalesCompLocationMapPageProps) {
  const { projectId, compId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);

  const { project, isLoading, updateProject } = useProject(decodedProjectId);

  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo>({
    address: "",
    addressForDisplay: "",
    legalDescription: "",
    acres: "",
  });
  const [apn, setApn] = useState<string[] | undefined>(undefined);
  const [compNumber, setCompNumber] = useState<string | undefined>(undefined);
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
  const [showGisOverlay, setShowGisOverlay] = useState(false);
  const [gisApn, setGisApn] = useState("");
  const [documentFrameSize, setDocumentFrameSize] = useState(1.0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const applyProjectState = useCallback(
    (proj?: ProjectData) => {
      const snapshot = normalizeProjectData(proj);
      const { map: mapState } = ensureCompLocationMap(snapshot, compId);

      const comparable = snapshot.comparables.find((c) => c.id === compId);
      const marker = getCompMarker(mapState, compId);

      const infoAddress = comparable?.address ?? "";
      const infoAddressForDisplay =
        comparable?.addressForDisplay ?? infoAddress;

      setPropertyInfo({
        address: infoAddress,
        addressForDisplay: infoAddressForDisplay,
        legalDescription: "",
        acres: "",
      });
      setApn(comparable?.apn);
      setCompNumber(comparable?.number);

      const initialMarkerPos = marker?.markerPosition ?? null;
      setMarkerPosition(initialMarkerPos ? { ...initialMarkerPos } : null);
      setBubblePosition(
        marker?.bubblePosition
          ? { ...marker.bubblePosition }
          : initialMarkerPos
            ? {
                lat: initialMarkerPos.lat + 0.001,
                lng: initialMarkerPos.lng + 0.001,
              }
            : null,
      );

      setMapCenter(
        mapState.mapCenter
          ? { ...mapState.mapCenter }
          : initialMarkerPos
            ? { ...initialMarkerPos }
            : { ...DEFAULT_MAP_CENTER },
      );
      setMapZoom(mapState.mapZoom);
      setBubbleSize(mapState.bubbleSize);
      setHideUI(mapState.hideUI);
      setDocumentFrameSize(mapState.documentFrameSize ?? 1.0);

      setPolygonPath(
        mapState.drawings.polygonPath.map((p) => ({ ...p })),
      );
      setCircles(
        mapState.drawings.circles.map((c) => ({
          ...c,
          center: { ...c.center },
        })),
      );
      setTailDirection(mapState.drawings.tailDirection);
      setIsSubjectTailPinned(marker?.isTailPinned ?? true);
      setSubjectPinnedTailTipPosition(
        marker?.pinnedTailTipPosition ?? undefined,
      );
      setStreetLabels(
        mapState.drawings.streetLabels.map((l) => ({
          ...l,
          position: { ...l.position },
          isEditing: l.isEditing ?? false,
        })),
      );
      setLabelSize(mapState.drawings.labelSize);
      setCircleRadius(mapState.drawings.circleRadius);
      setIsDrawing(false);
      setIsDrawingCircle(false);
      setIsRepositioningSubjectTail(false);
    },
    [compId],
  );

  // Sync refs with state
  useEffect(() => {
    markerPositionRef.current = markerPosition;
  }, [markerPosition]);

  useEffect(() => {
    bubblePositionRef.current = bubblePosition;
  }, [bubblePosition]);

  // Hydrate local state from hook-provided project (first load only)
  useEffect(() => {
    if (isStateHydrated || isLoading || !project) return;
    applyProjectState(project);
    setIsStateHydrated(true);
  }, [applyProjectState, isStateHydrated, isLoading, project]);

  const persistCurrentProjectState = useCallback(() => {
    const mapId = compLocationMapId(compId);

    const compMarker: MapMarker = {
      id: `marker-${compId}-${mapId}`,
      mapId,
      compId,
      markerPosition: markerPosition ? { ...markerPosition } : null,
      bubblePosition: bubblePosition ? { ...bubblePosition } : null,
      isTailPinned: isSubjectTailPinned,
      pinnedTailTipPosition: subjectPinnedTailTipPosition
        ? { ...subjectPinnedTailTipPosition }
        : null,
    };

    const mapView: MapView = {
      id: mapId,
      type: "comp-location",
      linkedCompId: compId,
      mapCenter: mapCenter ? { ...mapCenter } : { ...DEFAULT_MAP_CENTER },
      mapZoom,
      bubbleSize,
      hideUI,
      documentFrameSize,
      drawings: {
        polygonPath: polygonPath.map((p) => ({ ...p })),
        circles: circles.map((c) => ({
          ...c,
          center: { ...c.center },
        })),
        polylines: [],
        streetLabels: streetLabels.map((l) => ({
          ...l,
          position: { ...l.position },
        })),
        labelSize,
        circleRadius,
        tailDirection,
      },
      markers: [compMarker],
    };

    updateProject((prev) => {
      const existingMapIndex = prev.maps.findIndex((m) => m.id === mapId);
      const updatedMaps =
        existingMapIndex >= 0
          ? prev.maps.map((m) => (m.id === mapId ? mapView : m))
          : [...prev.maps, mapView];

      return {
        ...prev,
        maps: updatedMaps,
      };
    });
  }, [
    bubblePosition,
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
    streetLabels,
    subjectPinnedTailTipPosition,
    tailDirection,
    bubbleSize,
    compId,
    updateProject,
  ]);

  useEffect(() => {
    if (!isStateHydrated) return;
    persistCurrentProjectState();
  }, [isStateHydrated, persistCurrentProjectState]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500">Loading project…</p>
      </div>
    );
  }

  const handleAddressSearch = async (address: string) => {
      // Reuse address search logic
      if (!address.trim()) return;
        try {
          const geocoder = new google.maps.Geocoder();
          const results = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
              void geocoder.geocode({ address }, (results, status) => { if (status === google.maps.GeocoderStatus.OK && results) resolve(results); else reject(new Error(`Geocoding failed`)); });
          });
          if (results && results.length > 0) {
            const result = results[0];
            if (!result) return;
            const location = result.geometry.location;
            const newPosition = { lat: location.lat(), lng: location.lng() };
            setMapCenter(newPosition);
            setMarkerPosition(newPosition);
            setBubblePosition({ lat: newPosition.lat + 0.001, lng: newPosition.lng + 0.001 });
            if (isSubjectTailPinned && !subjectPinnedTailTipPosition) { setSubjectPinnedTailTipPosition(newPosition); }
            setMapZoom(18);
            const formattedAddress = result.formatted_address ?? address;
            setPropertyInfo((prev) => {
              const keepDisplay = prev.addressForDisplay && prev.addressForDisplay.trim().length > 0 && prev.addressForDisplay !== prev.address;
              return { ...prev, address: formattedAddress, addressForDisplay: keepDisplay ? prev.addressForDisplay : formattedAddress };
            });
          }
        } catch (error) {
          console.error("Error geocoding address", error);
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

      const documentAspectRatio = 1.5;
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
                suggestedName: "location-map.png",
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
             link.download = "location-map.png";
             link.click();
        } else {
            console.error("Screenshot save failed:", err);
            // Attempt fallback download even if picker failed for other reasons
             const croppedDataUrl = canvas.toDataURL("image/png");
             const link = document.createElement("a");
             link.href = croppedDataUrl;
             link.download = "location-map.png";
             link.click();
        }
      }

    } catch (error) {
      console.error("Screenshot failed:", error);
      alert("Failed to capture screenshot. Please try manually.");
    }
  };

  const handleOpenGis = (apn: string) => {
    setGisApn(apn);
    setShowGisOverlay(true);
  };

  const getGisUrl = (apn: string) => {
    if (apn.startsWith("R")) {
      return `https://maps.midlandtexas.gov/portal/apps/webappviewer/index.html?id=3cce4985d5f94f1c8c5d0ea06e1e5b47&apn=${apn}`;
    }
    return `https://search.ectorcad.org/map/#${apn}`;
  };

  return (
    <div className="flex h-screen w-full">
      <PropertyInfoPanel
        heading={`Sales Comp ${compNumber ? `#${compNumber}` : compId} Map`}
        propertyInfo={propertyInfo}
        onPropertyInfoChange={setPropertyInfo}
        // No share button or project header needed
        apn={apn}
        onAddressSearch={handleAddressSearch}
        onCaptureScreenshot={handleCaptureScreenshot}
        onOpenGis={handleOpenGis}
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
        documentFrameSize={documentFrameSize}
        onDocumentFrameSizeChange={setDocumentFrameSize}

        isCollapsed={isCollapsed}
        onIsCollapsedChange={setIsCollapsed}
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
              if (center) { setMapCenter({ lat: center.lat, lng: center.lng }); }
            }}
            onZoomChanged={(e) => {
              const zoom = e.detail.zoom;
              if (zoom) { setMapZoom(zoom); }
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
                  const newCircle: Circle = { center: { lat, lng }, radius: circleRadius * 1609.34, id: `circle-${Date.now()}-${Math.random()}` };
                  setCircles((prev) => [...prev, newCircle]);
                } else if (isDrawing) {
                  setPolygonPath((prev) => [...prev, { lat, lng }]);
                } else if (!markerPosition) {
                  setMarkerPosition({ lat, lng });
                  setBubblePosition({ lat: lat + 0.001, lng: lng + 0.001 });
                  if (isSubjectTailPinned && !subjectPinnedTailTipPosition) { setSubjectPinnedTailTipPosition({ lat, lng }); }
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
                    const newPosition = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                    const currentMarkerPos = markerPositionRef.current;
                    const currentBubblePos = bubblePositionRef.current;
                    if (currentMarkerPos && currentBubblePos) {
                      const latDiff = currentBubblePos.lat - currentMarkerPos.lat;
                      const lngDiff = currentBubblePos.lng - currentMarkerPos.lng;
                      setMarkerPosition(newPosition);
                      setBubblePosition({ lat: newPosition.lat + latDiff, lng: newPosition.lng + lngDiff });
                    } else { setMarkerPosition(newPosition); }
                  }
                }}
              >
                <div className="h-4 w-4 cursor-grab rounded-full border-2 border-white bg-red-600 shadow-lg active:cursor-grabbing" />
              </AdvancedMarker>
            )}
            {isSubjectTailPinned && subjectPinnedTailTipPosition && bubblePosition && markerPosition && !hideUI && (
                 <PinnedTailOverlay bubblePosition={bubblePosition} pinnedTailTipPosition={subjectPinnedTailTipPosition} bubbleWidth={400 * bubbleSize} bubbleHeight={200 * bubbleSize} color="#ffffff" strokeColor="#000000" />
            )}
            {bubblePosition && markerPosition && !hideUI && (
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
                onPositionChange={(newPosition) => { setStreetLabels((prev) => prev.map((l) => l.id === label.id ? { ...l, position: newPosition } : l)); }}
                onRotationChange={(newRotation) => { setStreetLabels((prev) => prev.map((l) => l.id === label.id ? { ...l, rotation: newRotation } : l)); }}
                onTextChange={(newText) => { setStreetLabels((prev) => prev.map((l) => l.id === label.id ? { ...l, text: newText } : l)); }}
                isEditing={label.isEditing}
                onEditToggle={() => { setStreetLabels((prev) => prev.map((l) => l.id === label.id ? { ...l, isEditing: !l.isEditing } : l)); }}
                hideUI={hideUI}
                sizeMultiplier={labelSize}
              />
            ))}
          </Map>
        </APIProvider>
        <DocumentOverlay enabled={showDocumentOverlay} size={documentFrameSize} aspectRatio={1.5} />

        <GisOverlay
          initialUrl={getGisUrl(gisApn)}
          visible={showGisOverlay}
          onClose={() => setShowGisOverlay(false)}
          position="absolute"
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
          isGisOverlayActive={showGisOverlay}
        />
      </div>
    </div>
  );
}
