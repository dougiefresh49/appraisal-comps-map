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
  // encodeState,
  // decodeState,
  // MAX_URL_STATE_LENGTH,
} from "~/utils/statePersistence";
import {
  createDefaultProject,
  normalizeProjectData,
  normalizeProjectsMap,
  // getNextProjectName,
  PROJECTS_STORAGE_KEY,
  CURRENT_PROJECT_STORAGE_KEY,
  DEFAULT_MAP_CENTER,
} from "~/utils/projectStore";
import type {
  ComparableInfo,
  ComparablesMapState,
  ProjectData,
  ProjectsMap,
  SubjectInfo,
  ProjectSubjectState,
  LocationMapState,
  ComparableType,
} from "~/utils/projectStore";

// Type specific to this page
const PAGE_COMPARABLE_TYPE: ComparableType = "Land";

interface ComparablesMapPageProps {
  params: Promise<{
    projectId: string;
  }>;
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
  // Lock active type to this page's type
  const [activeType, setActiveType] = useState<ComparableType>(PAGE_COMPARABLE_TYPE);
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

  const applyProjectState = useCallback(
    (project?: ProjectData, typeOverride?: ComparableType) => {
      const snapshot = normalizeProjectData(project);
      const nextType =
        typeOverride ?? PAGE_COMPARABLE_TYPE;
      const mapState =
        snapshot.comparables.byType[nextType] ??
        createDefaultProject().comparables.byType[nextType];
      const subjectSnapshot = snapshot.subject;
      const subjectInfoSnapshot = subjectSnapshot.info;

      setActiveType(nextType);
      setSubjectInfo({
        address: subjectInfoSnapshot.address ?? "",
        addressForDisplay:
          subjectInfoSnapshot.addressForDisplay ??
          subjectInfoSnapshot.address ??
          "",
        legalDescription: subjectInfoSnapshot.legalDescription ?? "",
        acres: subjectInfoSnapshot.acres ?? "",
      });
      setSubjectMarkerPosition(
        subjectSnapshot.markerPosition
          ? { ...subjectSnapshot.markerPosition }
          : null,
      );
      setSubjectBubblePosition(
        subjectSnapshot.bubblePosition
          ? { ...subjectSnapshot.bubblePosition }
          : null,
      );
      setComparables(
        (mapState.comparables ?? []).map((comp) => {
          let resolvedMarkerPosition = comp.markerPosition;
          let resolvedPosition = comp.position;
          const resolvedPinnedTailTipPosition = comp.pinnedTailTipPosition;

          if (nextType === "Land" && mapState.landLocationMaps?.[comp.id]) {
            const landMapState = mapState.landLocationMaps[comp.id];
            if (landMapState) {
              if (landMapState.markerPosition) {
                resolvedMarkerPosition = { ...landMapState.markerPosition };
              }
              if (landMapState.bubblePosition) {
                resolvedPosition = { ...landMapState.bubblePosition };
              }
            }
          }

          // Calculate defaults if needed
          const finalMarkerPosition = resolvedMarkerPosition ? { ...resolvedMarkerPosition } : undefined;
          
          let finalPosition = resolvedPosition ? { ...resolvedPosition } : undefined;
          if (!finalPosition && finalMarkerPosition) {
             finalPosition = { lat: finalMarkerPosition.lat + 0.001, lng: finalMarkerPosition.lng + 0.001 };
          }

          let finalPinnedTailTipPosition = resolvedPinnedTailTipPosition ? { ...resolvedPinnedTailTipPosition } : undefined;
          if (comp.isTailPinned && !finalPinnedTailTipPosition && finalMarkerPosition) {
            finalPinnedTailTipPosition = { ...finalMarkerPosition };
          }

          return {
            ...comp,
            type: comp.type ?? nextType,
            pinnedTailTipPosition: finalPinnedTailTipPosition,
            position: finalPosition,
            markerPosition: finalMarkerPosition,
          };
        }),
      );
      setMapCenter(
        mapState.mapCenter
          ? { ...mapState.mapCenter }
          : { ...DEFAULT_MAP_CENTER },
      );
      setMapZoom(mapState.mapZoom ?? 17);
      setBubbleSize(mapState.bubbleSize ?? 1.0);
      setHideUI(mapState.hideUI ?? false);
      setDocumentFrameSize(mapState.documentFrameSize ?? 1.0);
      setIsSubjectTailPinned(subjectSnapshot.isTailPinned ?? true);
      setSubjectPinnedTailTipPosition(
        subjectSnapshot.pinnedTailTipPosition ?? undefined,
      );
      setPinningTailForCompId(null);
      setIsRepositioningSubjectTail(false);
    },
    [
      setSubjectInfo,
      setSubjectMarkerPosition,
      setSubjectBubblePosition,
      setComparables,
      setMapCenter,
      setMapZoom,
      setBubbleSize,
      setHideUI,
      setIsSubjectTailPinned,
      setSubjectPinnedTailTipPosition,
      setPinningTailForCompId,
      setIsRepositioningSubjectTail,
      setActiveType,
    ],
  );

  // Sync refs with state
  useEffect(() => {
    subjectMarkerPositionRef.current = subjectMarkerPosition;
  }, [subjectMarkerPosition]);

  useEffect(() => {
    subjectBubblePositionRef.current = subjectBubblePosition;
  }, [subjectBubblePosition]);

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
    // Always use the page specific type when hydrating
    applyProjectState(projectStore[projectName], PAGE_COMPARABLE_TYPE);

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
        address: subjectInfo.address ?? "",
        addressForDisplay:
          subjectInfo.addressForDisplay ?? subjectInfo.address ?? "",
        legalDescription: subjectInfo.legalDescription ?? "",
        acres: subjectInfo.acres ?? "",
      },
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

    const previousState =
      baseProject.comparables.byType[activeType] ??
      createDefaultProject().comparables.byType[activeType];

    const currentMapState: ComparablesMapState = {
      ...previousState,
      subjectMarkerPosition: subject.markerPosition,
      subjectBubblePosition: subject.bubblePosition,
      comparables: comparables.map((comp) => ({
        ...comp,
        type: comp.type ?? activeType,
        pinnedTailTipPosition: comp.pinnedTailTipPosition
          ? { ...comp.pinnedTailTipPosition }
          : undefined,
        position: comp.position ? { ...comp.position } : undefined,
        markerPosition: comp.markerPosition
          ? { ...comp.markerPosition }
          : undefined,
      })),
      mapCenter: mapCenter ? { ...mapCenter } : { ...DEFAULT_MAP_CENTER },
      mapZoom,
      bubbleSize,
      hideUI,
      documentFrameSize,
      landLocationMaps:
        activeType === "Land"
          ? { ...(previousState.landLocationMaps ?? {}) }
          : previousState.landLocationMaps,
    };

    const comparablesState = {
      activeType,
      byType: {
        ...baseProject.comparables.byType,
        [activeType]: currentMapState,
      },
    };

    const locationState: LocationMapState = {
      ...baseProject.location,
      markerPosition: subject.markerPosition,
      bubblePosition: subject.bubblePosition,
    };

    const snapshot: ProjectData = {
      ...baseProject,
      subject,
      comparables: comparablesState,
      location: locationState,
    };

    projectStoreRef.current[projectName] = snapshot;
    serializedProjectRef.current = snapshot;
  }, [
    activeType,
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
      // In this page we effectively don't want to switch type, 
      // but if we do (e.g. from UI), it should probably navigate to the other route?
      // Or we just update local state.
      // For now, let's keep local update but the route stays 'land-sales'.
      // Better: redirect to correct route? 
      // User request implies separate pages. 
      // For now, I will allow switching in place as it might be useful, 
      // BUT `activeType` was initialized to PAGE_COMPARABLE_TYPE. 
      // If user switches to "Sales", they start editing Sales data on "Data for Land" page? Confusing.
      // Ideally we disable the type switcher or make it a navigator.
      
      // Let's implement navigation.
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

  // Handle share (simple version)


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
     // Copied logic
     if (!address.trim()) return;
    try {
      const geocoder = new google.maps.Geocoder();
      const results = await new Promise<google.maps.GeocoderResult[]>(
        (resolve, reject) => {
          void geocoder.geocode({ address }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results) { resolve(results); } 
            else { reject(new Error(`Geocoding failed: ${status}`)); }
          });
        },
      );
      if (results && results.length > 0) {
        const location = results[0]!.geometry.location;
        const newPosition = { lat: location.lat(), lng: location.lng() };
        setMapCenter(newPosition);
        setSubjectMarkerPosition(newPosition);
        setSubjectBubblePosition({ lat: newPosition.lat + 0.001, lng: newPosition.lng + 0.001 });
        if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
          setSubjectPinnedTailTipPosition(newPosition);
        }
        setMapZoom(18);
        const formattedAddress = results[0]?.formatted_address ?? address;
        setSubjectInfo((prev) => {
          const keepDisplay = prev.addressForDisplay && prev.addressForDisplay.trim().length > 0 && prev.addressForDisplay !== prev.address;
          return { ...prev, address: formattedAddress, addressForDisplay: keepDisplay ? prev.addressForDisplay : formattedAddress };
        });
      }
    } catch (error) { console.error("Error geocoding address:", error); }
  };

  const handleComparableAddressSearch = async (compId: string, address: string) => {
    // Copied logic
    if (!address.trim()) return;
    try {
      const geocoder = new google.maps.Geocoder();
      const decimalMatch = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(address);
      if (decimalMatch) {
          // ... coordinate handling ...
          const lat = Number(decimalMatch[1]);
          const lng = Number(decimalMatch[2]);
           const newPosition = { lat, lng };
          setComparables((prev) => prev.map((comp) => {
              if (comp.id !== compId) return comp;
              return { ...comp, type: comp.type ?? activeType, address: `${lat}, ${lng}`, markerPosition: newPosition, position: comp.position ?? { lat: newPosition.lat + 0.001, lng: newPosition.lng + 0.001 }, pinnedTailTipPosition: comp.pinnedTailTipPosition ?? (comp.isTailPinned ? newPosition : undefined) };
          }));
          return;
      }
      
      const results = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
          void geocoder.geocode({ address }, (results, status) => { if (status === google.maps.GeocoderStatus.OK && results) resolve(results); else reject(new Error(`Geocoding failed`)); });
      });
      if (results && results.length > 0) {
           const location = results[0]!.geometry.location;
           const newPosition = { lat: location.lat(), lng: location.lng() };
            setComparables((prev) => prev.map((comp) => {
             if (comp.id !== compId) return comp;
             return { ...comp, type: comp.type ?? activeType, address, addressForDisplay: comp.addressForDisplay ?? address, markerPosition: newPosition, position: comp.position ?? { lat: newPosition.lat + 0.001, lng: newPosition.lng + 0.001 }, pinnedTailTipPosition: comp.pinnedTailTipPosition ?? (comp.isTailPinned ? newPosition : undefined) };
           }));
      }
    } catch (error) { console.error("Error geocoding comparable address:", error); }
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
              type: comp.type ?? activeType,
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
        activeType={activeType}
        onActiveTypeChange={handleActiveTypeChange}
        pinningTailForCompId={pinningTailForCompId}
        onPinningTailForCompIdChange={setPinningTailForCompId}
        isSubjectTailPinned={isSubjectTailPinned}
        onIsSubjectTailPinnedChange={setIsSubjectTailPinned}
        subjectPinnedTailTipPosition={subjectPinnedTailTipPosition}
        onSubjectPinnedTailTipPositionChange={setSubjectPinnedTailTipPosition}
        isRepositioningSubjectTail={isRepositioningSubjectTail}
        onIsRepositioningSubjectTailChange={setIsRepositioningSubjectTail}
        // No Land Map link for Land Sales? Or is it redundant?
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

                // Handle pinning tails
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
                        return { ...comp, pinnedTailTipPosition: { lat, lng }, isTailPinned: true };
                      }
                      return comp;
                    })
                  );
                  setPinningTailForCompId(null);
                  return;
                }
                
                // If no marker set, set it
                if (!subjectMarkerPosition) {
                    setSubjectMarkerPosition({ lat, lng });
                    setSubjectBubblePosition({ lat: lat + 0.001, lng: lng + 0.001 });
                     if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
                        setSubjectPinnedTailTipPosition({ lat, lng });
                    }
                }
              }
            }}
          >
            {/* Subject Marker */}
             {subjectMarkerPosition && !hideUI && (
              <AdvancedMarker
                position={subjectMarkerPosition}
                draggable
                onDragEnd={(e) => {
                  if (e.latLng) {
                    const newPosition = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                    const currentMarkerPos = subjectMarkerPositionRef.current;
                    const currentBubblePos = subjectBubblePositionRef.current;
                    if (currentMarkerPos && currentBubblePos) {
                        const latDiff = currentBubblePos.lat - currentMarkerPos.lat;
                        const lngDiff = currentBubblePos.lng - currentMarkerPos.lng;
                        setSubjectMarkerPosition(newPosition);
                        setSubjectBubblePosition({ lat: newPosition.lat + latDiff, lng: newPosition.lng + lngDiff });
                    } else {
                        setSubjectMarkerPosition(newPosition);
                    }
                  }
                }}
              >
                <div className="h-4 w-4 cursor-grab rounded-full border-2 border-white bg-red-600 shadow-lg active:cursor-grabbing" />
              </AdvancedMarker>
            )}

            {isSubjectTailPinned && subjectPinnedTailTipPosition && subjectBubblePosition && subjectMarkerPosition && (
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
                // No tail direction for subject in comparables map in this component? 
                // Original used tailDirection undefined/built-in
                tailDirection="right" 
                isTailPinned={isSubjectTailPinned}
                pinnedTailTipPosition={subjectPinnedTailTipPosition}
              />
            )}
            
            {/* Comparables Markers */}
            {comparablesWithDistance.map((comp, index) => (
                <ComparableMarker
                    key={comp.id}
                    position={comp.position as { lat: number; lng: number }}
                    markerPosition={comp.markerPosition as { lat: number; lng: number }}
                    comparableInfo={comp}
                    comparableNumber={index + 1}
                    onPositionChange={(newPos: { lat: number; lng: number }) => {
                        setComparables((prev) => prev.map((c) => c.id === comp.id ? { ...c, position: newPos } : c));
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
