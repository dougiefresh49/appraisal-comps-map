"use client";

import { useState, useRef, useEffect, useCallback, useMemo, use } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { env } from "~/env";
import { SubjectLocationMarker } from "~/components/SubjectLocationMarker";
import { ComparableMarker } from "~/components/ComparableMarker";
import { ComparablesPanel } from "~/components/ComparablesPanel";
import { formatDistanceAndDirection } from "~/utils/mapUtils";
import { PinnedTailOverlay } from "~/components/PinnedTailOverlay";
import { DocumentOverlay } from "~/components/DocumentOverlay";
import { MapLockGuard } from "~/components/MapLockGuard";
import { useProject } from "~/hooks/useProject";
import { useAutoPlaceComps } from "~/hooks/useAutoPlaceComps";
import { AutoPlacePreviewMarkers } from "~/components/AutoPlacePreviewMarkers";
import { AutoPlaceActionBar } from "~/components/AutoPlaceActionBar";
import {
  normalizeProjectData,
  DEFAULT_MAP_CENTER,
  WELL_KNOWN_MAP_IDS,
  getMapByType,
  getSubjectMarker,
  getCompMarker,
  getComparablesByType,
  buildComparableInfo,
  splitComparableInfo,
  updateMapInProject,
  mapTypeForCompType,
} from "~/utils/projectStore";
import type {
  ComparableInfo,
  ProjectData,
  SubjectInfo,
  ComparableType,
  MapMarker,
  Comparable,
} from "~/utils/projectStore";

const PAGE_COMPARABLE_TYPE: ComparableType = "Land";
const LAND_COMPS_MAP_TYPE = mapTypeForCompType(PAGE_COMPARABLE_TYPE);
const LAND_COMPS_MAP_ID = WELL_KNOWN_MAP_IDS["land-comps"];

interface ComparablesMapPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

function enrichComparableInfoForUi(info: ComparableInfo): ComparableInfo {
  const finalMarkerPosition = info.markerPosition
    ? { ...info.markerPosition }
    : undefined;
  let finalPosition = info.position ? { ...info.position } : undefined;
  if (!finalPosition && finalMarkerPosition) {
    finalPosition = {
      lat: finalMarkerPosition.lat + 0.001,
      lng: finalMarkerPosition.lng + 0.001,
    };
  }
  let finalPinnedTailTipPosition = info.pinnedTailTipPosition
    ? { ...info.pinnedTailTipPosition }
    : undefined;
  if (info.isTailPinned && !finalPinnedTailTipPosition && finalMarkerPosition) {
    finalPinnedTailTipPosition = { ...finalMarkerPosition };
  }
  return {
    ...info,
    pinnedTailTipPosition: finalPinnedTailTipPosition,
    position: finalPosition,
    markerPosition: finalMarkerPosition,
  };
}

export default function LandComparablesMapPage({
  params,
}: ComparablesMapPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);

  const { project, isLoading, updateProject } = useProject(decodedProjectId);

  const [subjectInfo, setSubjectInfo] = useState<SubjectInfo>({
    address: "",
    addressForDisplay: "",
    legalDescription: undefined,
    acres: undefined,
  });
  const [subjectMarkerPosition, setSubjectMarkerPosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [subjectBubblePosition, setSubjectBubblePosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [comparables, setComparables] = useState<ComparableInfo[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(
    () => ({ ...DEFAULT_MAP_CENTER }),
  );
  const [mapZoom, setMapZoom] = useState(17);
  const mapCenterRef = useRef(mapCenter);
  const mapZoomRef = useRef(mapZoom);
  const [bubbleSize, setBubbleSize] = useState(1.0);
  const [hideUI, setHideUI] = useState(false);
  const [showDocumentOverlay, setShowDocumentOverlay] = useState(false);
  const [documentFrameSize, setDocumentFrameSize] = useState(1.0);
  const [pinningTailForCompId, setPinningTailForCompId] = useState<
    string | null
  >(null);
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
  const subjectMarkerPositionRef = useRef<{ lat: number; lng: number } | null>(
    null,
  );
  const subjectBubblePositionRef = useRef<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isStateHydrated, setIsStateHydrated] = useState(false);
  const [mapReadOnly, setMapReadOnly] = useState(true);
  /** Last map camera persisted to the project (or loaded from it); exploratory read-only pans do not update this. */
  const persistedMapViewportRef = useRef({
    center: { ...DEFAULT_MAP_CENTER } as { lat: number; lng: number },
    zoom: 17,
  });
  /** True after the user changes pan/zoom while the map lock is held (editing). */
  const mapCameraEditedWhileUnlockedRef = useRef(false);
  const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyProjectState = useCallback((project?: ProjectData) => {
    const snapshot = normalizeProjectData(project);
    const mapView = getMapByType(snapshot, LAND_COMPS_MAP_TYPE);
    if (!mapView) return;

    const subjectMarker = getSubjectMarker(mapView);
    const subjectSnapshot = snapshot.subject;

    setSubjectInfo({
      address: subjectSnapshot.address ?? "",
      addressForDisplay:
        subjectSnapshot.addressForDisplay ?? subjectSnapshot.address ?? "",
      legalDescription: subjectSnapshot.legalDescription ?? "",
      acres: subjectSnapshot.acres ?? "",
    });
    setSubjectMarkerPosition(
      subjectMarker?.markerPosition
        ? { ...subjectMarker.markerPosition }
        : null,
    );
    setSubjectBubblePosition(
      subjectMarker?.bubblePosition
        ? { ...subjectMarker.bubblePosition }
        : null,
    );

    const landComps = getComparablesByType(snapshot, PAGE_COMPARABLE_TYPE);
    setComparables(
      landComps.map((comp) => {
        const marker = getCompMarker(mapView, comp.id);
        const info = buildComparableInfo(comp, marker);
        return enrichComparableInfoForUi(info);
      }),
    );

    const nextCenter = mapView.mapCenter
      ? { ...mapView.mapCenter }
      : { ...DEFAULT_MAP_CENTER };
    const nextZoom = mapView.mapZoom ?? 17;
    persistedMapViewportRef.current = {
      center: nextCenter,
      zoom: nextZoom,
    };
    mapCameraEditedWhileUnlockedRef.current = false;
    setMapCenter(nextCenter);
    setMapZoom(nextZoom);
    setBubbleSize(mapView.bubbleSize ?? 1.0);
    setHideUI(mapView.hideUI ?? false);
    setDocumentFrameSize(mapView.documentFrameSize ?? 1.0);
    setIsSubjectTailPinned(subjectMarker?.isTailPinned ?? true);
    setSubjectPinnedTailTipPosition(
      subjectMarker?.pinnedTailTipPosition ?? undefined,
    );
    setPinningTailForCompId(null);
    setIsRepositioningSubjectTail(false);
  }, []);

  useEffect(() => {
    subjectMarkerPositionRef.current = subjectMarkerPosition;
  }, [subjectMarkerPosition]);

  useEffect(() => {
    subjectBubblePositionRef.current = subjectBubblePosition;
  }, [subjectBubblePosition]);

  useEffect(() => {
    mapCenterRef.current = mapCenter;
  }, [mapCenter]);

  useEffect(() => {
    mapZoomRef.current = mapZoom;
  }, [mapZoom]);

  const mapReadOnlyRef = useRef(mapReadOnly);
  useEffect(() => {
    mapReadOnlyRef.current = mapReadOnly;
  }, [mapReadOnly]);

  useEffect(() => {
    if (isStateHydrated) return;
    if (isLoading) return;
    if (!project) return;

    applyProjectState(project);
    setIsStateHydrated(true);
  }, [project, isLoading, isStateHydrated, applyProjectState]);

  const saveProject = useCallback(() => {
    const cameraDirty = mapCameraEditedWhileUnlockedRef.current;
    const persistedCam = persistedMapViewportRef.current;
    const liveCenter = mapCenterRef.current;
    const centerForSave = cameraDirty
      ? (liveCenter ? { ...liveCenter } : { ...DEFAULT_MAP_CENTER })
      : { ...persistedCam.center };
    const zoomForSave = cameraDirty ? mapZoomRef.current : persistedCam.zoom;

    updateProject((baseProject) => {
      const updatedSubject: SubjectInfo = {
        address: subjectInfo.address ?? "",
        addressForDisplay:
          subjectInfo.addressForDisplay ?? subjectInfo.address ?? "",
        legalDescription: subjectInfo.legalDescription ?? "",
        acres: subjectInfo.acres ?? "",
      };

      const mapId = LAND_COMPS_MAP_ID;
      const subjectMarker: MapMarker = {
        id: `marker-subject-${mapId}`,
        mapId,
        markerPosition: subjectMarkerPosition
          ? { ...subjectMarkerPosition }
          : null,
        bubblePosition: subjectBubblePosition
          ? { ...subjectBubblePosition }
          : null,
        isTailPinned: isSubjectTailPinned,
        pinnedTailTipPosition: subjectPinnedTailTipPosition
          ? { ...subjectPinnedTailTipPosition }
          : null,
      };

      const splitPairs = comparables.map((comp) =>
        splitComparableInfo(
          {
            ...comp,
            type: comp.type ?? PAGE_COMPARABLE_TYPE,
            address: comp.address,
            addressForDisplay: comp.addressForDisplay ?? comp.address ?? "",
            isTailPinned: comp.isTailPinned,
          },
          mapId,
        ),
      );
      const updatedComparables: Comparable[] = splitPairs.map(
        (p) => p.comparable,
      );
      const compMarkers: MapMarker[] = splitPairs.map((p) => p.marker);

      const otherComparables = baseProject.comparables.filter(
        (c) => c.type !== PAGE_COMPARABLE_TYPE,
      );

      const updatedMaps = updateMapInProject(baseProject, mapId, (m) => ({
        ...m,
        mapCenter: centerForSave,
        mapZoom: zoomForSave,
        bubbleSize,
        hideUI,
        documentFrameSize,
        markers: [subjectMarker, ...compMarkers],
      }));

      return {
        ...baseProject,
        subject: updatedSubject,
        comparables: [...otherComparables, ...updatedComparables],
        maps: updatedMaps,
      };
    });

    if (cameraDirty) {
      persistedMapViewportRef.current = {
        center: centerForSave,
        zoom: zoomForSave,
      };
      mapCameraEditedWhileUnlockedRef.current = false;
    }
  }, [
    updateProject,
    comparables,
    documentFrameSize,
    hideUI,
    isSubjectTailPinned,
    bubbleSize,
    subjectBubblePosition,
    subjectInfo,
    subjectMarkerPosition,
    subjectPinnedTailTipPosition,
  ]);

  const handleActiveTypeChange = useCallback(
    (type: ComparableType) => {
      let targetPath = "land-sales";
      if (type === "Sales") targetPath = "sales";
      if (type === "Rentals") targetPath = "rentals";

      window.location.href = `/project/${projectId}/${targetPath}/comparables-map`;
    },
    [projectId],
  );

  const handleCaptureScreenshot = useCallback(async () => {
    try {
      const { toPng } = await import("html-to-image");
      const container = document.getElementById("comparables-map-container");
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
            suggestedName: "land-comparables-map.png",
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
        link.download = "land-comparables-map.png";
        link.click();
      }
    } catch (error) {
      console.error("Screenshot failed:", error);
      alert("Failed to capture screenshot. Please try manually.");
    }
  }, [documentFrameSize]);

  const saveProjectRef = useRef(saveProject);
  useEffect(() => {
    saveProjectRef.current = saveProject;
  }, [saveProject]);

  useEffect(() => {
    if (!isStateHydrated) return;
    if (mapReadOnly) return;

    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }
    debouncedSaveRef.current = setTimeout(() => {
      debouncedSaveRef.current = null;
      saveProjectRef.current();
    }, 1500);

    return () => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
        debouncedSaveRef.current = null;
      }
    };
  }, [isStateHydrated, mapReadOnly, mapCenter, mapZoom]);

  useEffect(() => {
    if (!isStateHydrated) return;
    if (mapReadOnly) return;
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
      debouncedSaveRef.current = null;
    }
    saveProject();
  }, [isStateHydrated, mapReadOnly, saveProject]);

  useEffect(() => {
    return () => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
        debouncedSaveRef.current = null;
      }
      if (!mapReadOnlyRef.current) {
        saveProjectRef.current();
      }
    };
  }, []);

  const {
    proposedComparables,
    isAutoPlacing,
    failedCompIds,
    autoPlace,
    applyProposal,
    cancelProposal,
  } = useAutoPlaceComps({
    comparables,
    subjectMarkerPosition,
    subjectBubblePosition,
    bubbleSize,
    mapZoom,
    onApply: setComparables,
  });

  const comparablesWithDistance = useMemo(() => {
    const subjectRefPoint =
      subjectPinnedTailTipPosition ?? subjectMarkerPosition;

    return comparables.map((comp) => {
      let distance = "";
      const compRefPoint = comp.pinnedTailTipPosition ?? comp.markerPosition;

      if (subjectRefPoint && compRefPoint) {
        distance = formatDistanceAndDirection(
          subjectRefPoint.lat,
          subjectRefPoint.lng,
          compRefPoint.lat,
          compRefPoint.lng,
        );
      }
      return {
        ...comp,
        distance,
      };
    });
  }, [comparables, subjectPinnedTailTipPosition, subjectMarkerPosition]);

  const handleSubjectAddressSearch = async (address: string) => {
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
        const newPosition = { lat: location.lat(), lng: location.lng() };
        setMapCenter(newPosition);
        mapCameraEditedWhileUnlockedRef.current = true;
        setSubjectMarkerPosition(newPosition);
        setSubjectBubblePosition({
          lat: newPosition.lat + 0.001,
          lng: newPosition.lng + 0.001,
        });
        if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
          setSubjectPinnedTailTipPosition(newPosition);
        }
        setMapZoom(18);
        const formattedAddress = results[0]?.formatted_address ?? address;
        setSubjectInfo((prev) => {
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

  const handleComparableAddressSearch = async (
    compId: string,
    address: string,
  ) => {
    if (!address.trim()) return;
    try {
      const geocoder = new google.maps.Geocoder();
      const decimalMatch =
        /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(address);
      if (decimalMatch) {
        const lat = Number(decimalMatch[1]);
        const lng = Number(decimalMatch[2]);
        const newPosition = { lat, lng };
        setComparables((prev) =>
          prev.map((comp) => {
            if (comp.id !== compId) return comp;
            return {
              ...comp,
              type: comp.type ?? PAGE_COMPARABLE_TYPE,
              address: `${lat}, ${lng}`,
              markerPosition: newPosition,
              position: comp.position ?? {
                lat: newPosition.lat + 0.001,
                lng: newPosition.lng + 0.001,
              },
              pinnedTailTipPosition:
                comp.pinnedTailTipPosition ??
                (comp.isTailPinned ? newPosition : undefined),
            };
          }),
        );
        return;
      }

      const results = await new Promise<google.maps.GeocoderResult[]>(
        (resolve, reject) => {
          void geocoder.geocode({ address }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results) {
              resolve(results);
            } else {
              reject(new Error(`Geocoding failed`));
            }
          });
        },
      );
      if (results && results.length > 0) {
        const location = results[0]!.geometry.location;
        const newPosition = { lat: location.lat(), lng: location.lng() };
        setComparables((prev) =>
          prev.map((comp) => {
            if (comp.id !== compId) return comp;
            return {
              ...comp,
              type: comp.type ?? PAGE_COMPARABLE_TYPE,
              address,
              addressForDisplay: comp.addressForDisplay ?? address,
              markerPosition: newPosition,
              position: comp.position ?? {
                lat: newPosition.lat + 0.001,
                lng: newPosition.lng + 0.001,
              },
              pinnedTailTipPosition:
                comp.pinnedTailTipPosition ??
                (comp.isTailPinned ? newPosition : undefined),
            };
          }),
        );
      }
    } catch (error) {
      console.error("Error geocoding comparable address:", error);
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
    <div className="flex h-screen w-full flex-col">
      <MapLockGuard
        projectId={decodedProjectId}
        pageKey="comparables-map-land"
        onReadOnlyChange={setMapReadOnly}
        bodyClassName="relative flex min-h-0 flex-1 flex-row"
      >
        {({ readOnly }) => (
          <>
      {!readOnly ? (
      <ComparablesPanel
        subjectInfo={subjectInfo}
        onSubjectInfoChange={(info) =>
          setSubjectInfo((prev) => ({ ...prev, ...info }))
        }
        onSubjectAddressSearch={handleSubjectAddressSearch}
        comparables={comparables}
        onComparablesChange={(next) =>
          setComparables(
            next.map((comp) => ({
              ...comp,
              type: comp.type ?? PAGE_COMPARABLE_TYPE,
            })),
          )
        }
        onComparableAddressSearch={handleComparableAddressSearch}
        bubbleSize={bubbleSize}
        onBubbleSizeChange={setBubbleSize}
        hideUI={hideUI}
        onHideUIChange={setHideUI}
        showDocumentOverlay={showDocumentOverlay}
        onShowDocumentOverlayChange={setShowDocumentOverlay}
        documentFrameSize={documentFrameSize}
        onDocumentFrameSizeChange={setDocumentFrameSize}
        activeType={PAGE_COMPARABLE_TYPE}
        onActiveTypeChange={handleActiveTypeChange}
        pinningTailForCompId={pinningTailForCompId}
        onPinningTailForCompIdChange={setPinningTailForCompId}
        isSubjectTailPinned={isSubjectTailPinned}
        onIsSubjectTailPinnedChange={setIsSubjectTailPinned}
        subjectPinnedTailTipPosition={subjectPinnedTailTipPosition}
        onSubjectPinnedTailTipPositionChange={setSubjectPinnedTailTipPosition}
        isRepositioningSubjectTail={isRepositioningSubjectTail}
        onIsRepositioningSubjectTailChange={setIsRepositioningSubjectTail}
        onOpenLandMap={undefined}
        readOnly={mapReadOnly}
        onAutoPlace={autoPlace}
        isAutoPlacing={isAutoPlacing}
        onCaptureScreenshot={handleCaptureScreenshot}
      />
      ) : null}

      <div
        id="comparables-map-container"
        className="relative min-h-0 flex-1"
      >
        <APIProvider
          apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          libraries={["drawing"]}
        >
          <Map
            center={mapCenter}
            zoom={mapZoom}
            mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
            disableDefaultUI={false}
            zoomControl={!hideUI}
            mapTypeControl={readOnly || !hideUI}
            streetViewControl={!hideUI}
            fullscreenControl={!hideUI}
            scaleControl={!hideUI}
            rotateControl={!hideUI}
            gestureHandling="auto"
            onCenterChanged={(e) => {
              const center = e.detail.center;
              if (center) {
                setMapCenter({ lat: center.lat, lng: center.lng });
              }
              if (!readOnly) {
                mapCameraEditedWhileUnlockedRef.current = true;
              }
            }}
            onZoomChanged={(e) => {
              const zoom = e.detail.zoom;
              if (zoom) {
                setMapZoom(zoom);
              }
              if (!readOnly) {
                mapCameraEditedWhileUnlockedRef.current = true;
              }
            }}
            onClick={(e) => {
              if (readOnly) return;
              if (e.detail.latLng) {
                const lat = e.detail.latLng.lat;
                const lng = e.detail.latLng.lng;

                if (isRepositioningSubjectTail) {
                  setSubjectPinnedTailTipPosition({ lat, lng });
                  setIsRepositioningSubjectTail(false);
                  setIsSubjectTailPinned(true);
                  return;
                }

                if (pinningTailForCompId) {
                  setComparables((prev) =>
                    prev.map((comp) => {
                      if (comp.id === pinningTailForCompId) {
                        return {
                          ...comp,
                          pinnedTailTipPosition: { lat, lng },
                          isTailPinned: true,
                        };
                      }
                      return comp;
                    }),
                  );
                  setPinningTailForCompId(null);
                  return;
                }

                if (!subjectMarkerPosition) {
                  setSubjectMarkerPosition({ lat, lng });
                  setSubjectBubblePosition({
                    lat: lat + 0.001,
                    lng: lng + 0.001,
                  });
                  if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
                    setSubjectPinnedTailTipPosition({ lat, lng });
                  }
                }
              }
            }}
          >
            {subjectMarkerPosition && !hideUI && (
              <AdvancedMarker
                position={subjectMarkerPosition}
                draggable={!readOnly}
                onDragEnd={(e) => {
                  if (readOnly) return;
                  if (e.latLng) {
                    const newPosition = {
                      lat: e.latLng.lat(),
                      lng: e.latLng.lng(),
                    };
                    const currentMarkerPos = subjectMarkerPositionRef.current;
                    const currentBubblePos = subjectBubblePositionRef.current;
                    if (currentMarkerPos && currentBubblePos) {
                      const latDiff =
                        currentBubblePos.lat - currentMarkerPos.lat;
                      const lngDiff =
                        currentBubblePos.lng - currentMarkerPos.lng;
                      setSubjectMarkerPosition(newPosition);
                      setSubjectBubblePosition({
                        lat: newPosition.lat + latDiff,
                        lng: newPosition.lng + lngDiff,
                      });
                    } else {
                      setSubjectMarkerPosition(newPosition);
                    }
                  }
                }}
              >
                <div
                  className={`h-4 w-4 rounded-full border-2 border-white bg-red-600 shadow-lg ${readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
                />
              </AdvancedMarker>
            )}

            {isSubjectTailPinned &&
              subjectPinnedTailTipPosition &&
              subjectBubblePosition &&
              subjectMarkerPosition && (
                <PinnedTailOverlay
                  bubblePosition={subjectBubblePosition}
                  pinnedTailTipPosition={subjectPinnedTailTipPosition}
                  bubbleWidth={400 * bubbleSize}
                  bubbleHeight={200 * bubbleSize}
                  color="#ffffff"
                  strokeColor="#000000"
                />
              )}

            {subjectBubblePosition && subjectMarkerPosition && (
              <SubjectLocationMarker
                position={subjectBubblePosition}
                markerPosition={subjectMarkerPosition}
                propertyInfo={subjectInfo}
                onPositionChange={setSubjectBubblePosition}
                sizeMultiplier={bubbleSize}
                tailDirection="right"
                isTailPinned={isSubjectTailPinned}
                pinnedTailTipPosition={subjectPinnedTailTipPosition}
                readOnly={readOnly}
              />
            )}

            {comparablesWithDistance.map((comp, index) => (
              <ComparableMarker
                key={comp.id}
                position={comp.position as { lat: number; lng: number }}
                markerPosition={
                  comp.markerPosition as { lat: number; lng: number }
                }
                comparableInfo={comp}
                comparableNumber={index + 1}
                onPositionChange={(newPos: { lat: number; lng: number }) => {
                  setComparables((prev) =>
                    prev.map((c) =>
                      c.id === comp.id ? { ...c, position: newPos } : c,
                    ),
                  );
                }}
                sizeMultiplier={bubbleSize}
                isTailPinned={comp.isTailPinned}
                pinnedTailTipPosition={comp.pinnedTailTipPosition}
                color="#10b981"
                readOnly={readOnly}
              />
            ))}

            {/* Auto-place preview markers */}
            {proposedComparables && (
              <AutoPlacePreviewMarkers
                proposedComparables={proposedComparables}
                bubbleSize={bubbleSize}
                compColor="#10b981"
              />
            )}
          </Map>
        </APIProvider>
        <DocumentOverlay
          enabled={showDocumentOverlay}
          size={documentFrameSize}
        />
        {proposedComparables && (
          <AutoPlaceActionBar
            failedCount={failedCompIds.length}
            totalCount={comparables.length}
            onApply={applyProposal}
            onCancel={cancelProposal}
          />
        )}
      </div>
          </>
        )}
      </MapLockGuard>
    </div>
  );
}
