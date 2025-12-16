"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { env } from "~/env";
import { SubjectLocationMarker } from "~/components/SubjectLocationMarker";
import { ComparableMarker } from "~/components/ComparableMarker";
import { ComparablesPanel } from "~/components/ComparablesPanel";
import { formatDistanceAndDirection } from "~/utils/mapUtils";
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

const TYPE_COLORS: Record<ComparableType, string> = {
  Land: "#10b981",
  Sales: "#1447e6",
  Rentals: "#7c2dff",
};

export default function ComparablesMapPage() {
  const searchParams = useSearchParams();
  const projectStoreRef = useRef<ProjectsMap>({});
  const [projectName, setProjectName] = useState("Project 1");
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
  const [activeType, setActiveType] = useState<ComparableType>("Land");
  const [pinningTailForCompId, setPinningTailForCompId] = useState<
    string | null
  >(null);
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
        typeOverride ?? snapshot.comparables.activeType ?? "Land";
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
          // For Land comparables, check if there's a landLocationMap entry
          // and use positions from there if available
          let resolvedMarkerPosition = comp.markerPosition;
          let resolvedPosition = comp.position;
          let resolvedPinnedTailTipPosition = comp.pinnedTailTipPosition;

          if (nextType === "Land" && mapState.landLocationMaps?.[comp.id]) {
            const landMapState = mapState.landLocationMaps[comp.id];
            if (landMapState) {
              // Use markerPosition from landLocationMap if available
              if (landMapState.markerPosition) {
                resolvedMarkerPosition = { ...landMapState.markerPosition };
              }
              // Use bubblePosition from landLocationMap as the bubble position
              if (landMapState.bubblePosition) {
                resolvedPosition = { ...landMapState.bubblePosition };
              }
            }
            // Note: pinnedTailTipPosition is not stored in LocationMapState,
            // so we keep the one from the comparable itself
          }

          return {
            ...comp,
            type: comp.type ?? nextType,
            pinnedTailTipPosition: resolvedPinnedTailTipPosition
              ? { ...resolvedPinnedTailTipPosition }
              : undefined,
            position: resolvedPosition ? { ...resolvedPosition } : undefined,
            markerPosition: resolvedMarkerPosition
              ? { ...resolvedMarkerPosition }
              : undefined,
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

  // Hydrate state from URL/localStorage
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
      // subjectInfo removed - use subject.info instead
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
      // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
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
      // propertyInfo removed - use subject.info instead
      markerPosition: subject.markerPosition,
      bubblePosition: subject.bubblePosition,
      // isSubjectTailPinned and subjectPinnedTailTipPosition removed - use subject fields instead
    };

    const snapshot: ProjectData = {
      ...baseProject, // Preserve all top-level fields (subjectPhotosFolderId, projectFolderId, clientCompany, etc.)
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

  const handleActiveTypeChange = useCallback(
    (type: ComparableType) => {
      if (type === activeType) return;
      persistCurrentProjectState();
      const project = projectStoreRef.current[projectName];
      if (!project) return;
      applyProjectState(project, type);
    },
    [activeType, applyProjectState, persistCurrentProjectState, projectName],
  );

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

  const handleOpenLandMap = useCallback(
    (compId: string) => {
      if (!projectName || typeof window === "undefined") {
        return;
      }
      const url = new URL(`${window.location.origin}/land-comp-map`);
      url.searchParams.set("project", projectName);
      url.searchParams.set("compId", compId);
      window.location.href = url.toString();
    },
    [projectName],
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

  // Calculate distances and directions for comparables
  // Use useMemo to recalculate when subject tail tip or marker position changes
  // Use tail tip positions for both subject and comparables (where they've been placed)
  const comparablesWithDistance = useMemo(() => {
    // Use subject's pinned tail tip position if available, otherwise marker position
    const subjectRefPoint =
      subjectPinnedTailTipPosition ?? subjectMarkerPosition;

    return comparables.map((comp) => {
      let distance = "";
      // Use comparable's pinned tail tip position if available, otherwise marker position
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

  // Handle subject address search
  const handleSubjectAddressSearch = async (address: string) => {
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
        const newPosition = {
          lat: location.lat(),
          lng: location.lng(),
        };
        setMapCenter(newPosition);
        setSubjectMarkerPosition(newPosition);
        setSubjectBubblePosition({
          lat: newPosition.lat + 0.001,
          lng: newPosition.lng + 0.001,
        });
        // Set default pinned tail tip position if pinned but not set yet
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

  // Handle comparable address search
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
        if (
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180
        ) {
          const normalized = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

          // Reverse geocode to get a human-friendly address for display.
          let formattedAddress: string | undefined;
          try {
            const reverseResults = await new Promise<
              google.maps.GeocoderResult[]
            >((resolve, reject) => {
              geocoder.geocode(
                { location: { lat, lng } },
                (results, status) => {
                  if (status === "OK" && results) {
                    resolve(results);
                  } else {
                    reject(new Error(`Reverse geocoding failed: ${status}`));
                  }
                },
              );
            });
            formattedAddress = reverseResults?.[0]?.formatted_address;
          } catch {
            // ignore reverse-geocode errors; we still have valid coordinates
          }

          const newPosition = { lat, lng };

          setComparables((prev) =>
            prev.map((comp) => {
              if (comp.id !== compId) return comp;

              const keepDisplay =
                comp.addressForDisplay &&
                comp.addressForDisplay.trim().length > 0 &&
                comp.addressForDisplay !== comp.address;

              return {
                ...comp,
                type: comp.type ?? activeType,
                address: normalized,
                addressForDisplay: keepDisplay
                  ? comp.addressForDisplay
                  : (formattedAddress ?? normalized),
                markerPosition: newPosition,
                position: comp.position || {
                  lat: newPosition.lat + 0.001,
                  lng: newPosition.lng + 0.001,
                },
                pinnedTailTipPosition:
                  comp.pinnedTailTipPosition ||
                  (comp.isTailPinned ? newPosition : undefined),
              };
            }),
          );

          return;
        }
      }

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
        const newPosition = {
          lat: location.lat(),
          lng: location.lng(),
        };

        setComparables((prev) =>
          prev.map((comp) => {
            if (comp.id !== compId) return comp;

            // Distance will be calculated by useMemo when component re-renders
            // No need to calculate it here since it depends on subjectPinnedTailTipPosition

            return {
              ...comp,
              type: comp.type ?? activeType,
              address,
              addressForDisplay: comp.addressForDisplay || address,
              markerPosition: newPosition,
              // Set default position offset if not already set
              position: comp.position || {
                lat: newPosition.lat + 0.001,
                lng: newPosition.lng + 0.001,
              },
              // Set default pinned tail tip position if pinned but not set yet
              pinnedTailTipPosition:
                comp.pinnedTailTipPosition ||
                (comp.isTailPinned ? newPosition : undefined),
            };
          }),
        );
      }
    } catch (error) {
      console.error("Error geocoding comparable address:", error);
    }
  };

  // When a comparable is added, set default position offset from marker and pinned tail tip
  useEffect(() => {
    setComparables((prev) =>
      prev.map((comp) => {
        if (!comp.markerPosition) return comp;
        const updates: Partial<ComparableInfo> = {};

        // If no position set yet, add default offset
        if (!comp.position) {
          updates.position = {
            lat: comp.markerPosition.lat + 0.001,
            lng: comp.markerPosition.lng + 0.001,
          };
        }

        // If pinned but no pinned tail tip position set yet, use marker position
        if (comp.isTailPinned && !comp.pinnedTailTipPosition) {
          updates.pinnedTailTipPosition = comp.markerPosition;
        }

        return Object.keys(updates).length > 0 ? { ...comp, ...updates } : comp;
      }),
    );
  }, [comparables.map((c) => c.markerPosition?.lat).join(",")]);

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <ComparablesPanel
        projectName={projectName}
        onProjectNameEdit={handleProjectNameEdit}
        onProjectSwitch={handleProjectSwitch}
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
        onShare={handleShare}
        onOpenLandMap={handleOpenLandMap}
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

                // If we're in pin tail mode for a comparable, place or reposition the tail tip
                if (pinningTailForCompId) {
                  setComparables((prev) =>
                    prev.map((comp) =>
                      comp.id === pinningTailForCompId
                        ? {
                            ...comp,
                            isTailPinned: true,
                            pinnedTailTipPosition: { lat, lng },
                          }
                        : comp,
                    ),
                  );
                  setPinningTailForCompId(null);
                  return;
                }

                // If no subject marker, set it
                if (!subjectMarkerPosition) {
                  setSubjectMarkerPosition({ lat, lng });
                  setSubjectBubblePosition({
                    lat: lat + 0.001,
                    lng: lng + 0.001,
                  });
                  // Set default pinned tail tip position if pinned but not set yet
                  if (isSubjectTailPinned && !subjectPinnedTailTipPosition) {
                    setSubjectPinnedTailTipPosition({ lat, lng });
                  }
                }
              }
            }}
          >
            {/* Subject marker (red) */}
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
                <div className="h-4 w-4 cursor-grab rounded-full border-2 border-white bg-red-600 shadow-lg active:cursor-grabbing" />
              </AdvancedMarker>
            )}

            {/* Pinned tail overlay for subject (drawn as polygon) */}
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

            {/* Subject bubble (white) */}
            {subjectBubblePosition && subjectMarkerPosition && (
              <SubjectLocationMarker
                position={subjectBubblePosition}
                markerPosition={subjectMarkerPosition}
                propertyInfo={subjectInfo}
                onPositionChange={setSubjectBubblePosition}
                sizeMultiplier={bubbleSize}
                isTailPinned={isSubjectTailPinned}
                pinnedTailTipPosition={subjectPinnedTailTipPosition}
              />
            )}

            {/* Comparable markers */}
            {comparablesWithDistance.map((comp, index) => {
              if (!comp.markerPosition || !comp.position) return null;

              // Get color based on property types filter
              const comparableColor = TYPE_COLORS[activeType];

              return (
                <div key={comp.id}>
                  {/* Marker dot */}
                  {!hideUI && (
                    <AdvancedMarker position={comp.markerPosition}>
                      <div
                        className="h-4 w-4 cursor-grab rounded-full border-2 border-white shadow-lg active:cursor-grabbing"
                        style={{ backgroundColor: comparableColor }}
                      />
                    </AdvancedMarker>
                  )}

                  {/* Pinned tail overlay (drawn as polygon) */}
                  {comp.isTailPinned &&
                    comp.pinnedTailTipPosition &&
                    comp.position && (
                      <PinnedTailOverlay
                        bubblePosition={comp.position}
                        pinnedTailTipPosition={comp.pinnedTailTipPosition}
                        bubbleWidth={400 * bubbleSize}
                        bubbleHeight={200 * bubbleSize}
                        color={comparableColor}
                      />
                    )}

                  {/* Comparable bubble */}
                  <ComparableMarker
                    position={comp.position}
                    markerPosition={comp.markerPosition}
                    comparableInfo={{
                      address: comp.address,
                      addressForDisplay: comp.addressForDisplay || comp.address,
                      distance: comp.distance,
                    }}
                    comparableNumber={index + 1}
                    onPositionChange={(newPos) => {
                      // When pinned, tail stretches dynamically, so just update bubble position
                      // When not pinned, just update bubble position
                      setComparables((prev) =>
                        prev.map((c) =>
                          c.id === comp.id ? { ...c, position: newPos } : c,
                        ),
                      );
                    }}
                    sizeMultiplier={bubbleSize}
                    isTailPinned={comp.isTailPinned}
                    pinnedTailTipPosition={comp.pinnedTailTipPosition}
                    color={comparableColor}
                  />
                </div>
              );
            })}
          </Map>
        </APIProvider>
        <DocumentOverlay
          enabled={showDocumentOverlay}
          size={documentFrameSize}
        />
      </div>
    </div>
  );
}
