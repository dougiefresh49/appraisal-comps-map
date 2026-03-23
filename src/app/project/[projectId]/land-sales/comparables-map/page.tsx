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
import {
  createDefaultProject,
  normalizeProjectData,
  normalizeProjectsMap,
  PROJECTS_STORAGE_KEY,
  CURRENT_PROJECT_STORAGE_KEY,
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
  ProjectsMap,
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
  let finalMarkerPosition = info.markerPosition
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
  if (
    info.isTailPinned &&
    !finalPinnedTailTipPosition &&
    finalMarkerPosition
  ) {
    finalPinnedTailTipPosition = { ...finalMarkerPosition };
  }
  return {
    ...info,
    pinnedTailTipPosition: finalPinnedTailTipPosition,
    position: finalPosition,
    markerPosition: finalMarkerPosition,
  };
}

export default function LandComparablesMapPage({ params }: ComparablesMapPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);
  const projectName = decodedProjectId;

  const projectStoreRef = useRef<ProjectsMap>({});

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
  const serializedProjectRef = useRef<ProjectData | null>(null);

  const applyProjectState = useCallback((project?: ProjectData) => {
    const snapshot = normalizeProjectData(project);
    const mapView = getMapByType(snapshot, LAND_COMPS_MAP_TYPE);
    if (!mapView) return;

    const subjectMarker = getSubjectMarker(mapView);
    const subjectSnapshot = snapshot.subject;

    setSubjectInfo({
      address: subjectSnapshot.address ?? "",
      addressForDisplay:
        subjectSnapshot.addressForDisplay ??
        subjectSnapshot.address ??
        "",
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

    setMapCenter(
      mapView.mapCenter
        ? { ...mapView.mapCenter }
        : { ...DEFAULT_MAP_CENTER },
    );
    setMapZoom(mapView.mapZoom ?? 17);
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
      console.warn(
        `Project ${projectName} not found in storage, creating default.`,
      );
      projectStore[projectName] = createDefaultProject();
    }

    projectStoreRef.current = projectStore;
    applyProjectState(projectStore[projectName]);

    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projectStore),
      );
      window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, projectName);
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
    const updatedComparables: Comparable[] = splitPairs.map((p) => p.comparable);
    const compMarkers: MapMarker[] = splitPairs.map((p) => p.marker);

    const otherComparables = baseProject.comparables.filter(
      (c) => c.type !== PAGE_COMPARABLE_TYPE,
    );

    const updatedMaps = updateMapInProject(baseProject, mapId, (m) => ({
      ...m,
      mapCenter: mapCenter ? { ...mapCenter } : { ...DEFAULT_MAP_CENTER },
      mapZoom,
      bubbleSize,
      hideUI,
      documentFrameSize,
      markers: [subjectMarker, ...compMarkers],
    }));

    const snapshot: ProjectData = {
      ...baseProject,
      subject: updatedSubject,
      comparables: [...otherComparables, ...updatedComparables],
      maps: updatedMaps,
    };

    projectStoreRef.current[projectName] = snapshot;
    serializedProjectRef.current = snapshot;
  }, [
    comparables,
    documentFrameSize,
    hideUI,
    isSubjectTailPinned,
    mapCenter,
    mapZoom,
    bubbleSize,
    projectName,
    subjectBubblePosition,
    subjectInfo,
    subjectMarkerPosition,
    subjectPinnedTailTipPosition,
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
      console.error("Failed to save projects", error);
    }
  }, []);

  const handleActiveTypeChange = useCallback(
    (type: ComparableType) => {
      let targetPath = "land-sales";
      if (type === "Sales") targetPath = "sales";
      if (type === "Rentals") targetPath = "rentals";

      window.location.href = `/project/${projectId}/${targetPath}/comparables-map`;
    },
    [projectId],
  );

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
              position:
                comp.position ?? {
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
              position:
                comp.position ?? {
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

  return (
    <div className="flex h-screen w-full">
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
      />

      <div className="relative flex-1">
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
            mapTypeControl={!hideUI}
            streetViewControl={!hideUI}
            fullscreenControl={!hideUI}
            scaleControl={!hideUI}
            rotateControl={!hideUI}
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
                draggable
                onDragEnd={(e) => {
                  if (e.latLng) {
                    const newPosition = {
                      lat: e.latLng.lat(),
                      lng: e.latLng.lng(),
                    };
                    const currentMarkerPos = subjectMarkerPositionRef.current;
                    const currentBubblePos = subjectBubblePositionRef.current;
                    if (currentMarkerPos && currentBubblePos) {
                      const latDiff = currentBubblePos.lat - currentMarkerPos.lat;
                      const lngDiff = currentBubblePos.lng - currentMarkerPos.lng;
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
                <div className="h-4 w-4 cursor-grab rounded-full border-2 border-white bg-red-600 shadow-lg active:cursor-grabbing" />
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
              />
            )}

            {comparablesWithDistance.map((comp, index) => (
              <ComparableMarker
                key={comp.id}
                position={comp.position as { lat: number; lng: number }}
                markerPosition={comp.markerPosition as { lat: number; lng: number }}
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
              />
            ))}
          </Map>
        </APIProvider>
        <DocumentOverlay enabled={showDocumentOverlay} size={documentFrameSize} />
      </div>
    </div>
  );
}
