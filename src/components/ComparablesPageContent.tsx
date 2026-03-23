"use client";

import {
  MergeCompsDialog,
  type MergeConflict,
  type CompData,
} from "./MergeCompsDialog";
import { useState } from "react";
import { useProject } from "~/hooks/useProject";
import { ComparablesList } from "./ComparablesList";
import { APIProvider } from "@vis.gl/react-google-maps";
import { env } from "~/env";
import {
  type ComparableType,
  type Comparable,
  type ProjectData,
  type ImageData,
  type MapMarker,
  getComparablesByType,
  getMapByType,
  updateMapInProject,
  mapTypeForCompType,
} from "~/utils/projectStore";

interface ComparablesPageContentProps {
  projectId: string;
  type: ComparableType;
}

export function ComparablesPageContent({
  projectId,
  type,
}: ComparablesPageContentProps) {
  const { project, updateProject, isLoading, projectExists } =
    useProject(projectId);
  const decodedProjectId = decodeURIComponent(projectId);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[] | null>(
    null,
  );
  const [pendingComps, setPendingComps] = useState<
    { comp: CompData; existingId?: string }[] | null
  >(null);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          Loading project...
        </div>
      </div>
    );
  }

  if (!projectExists || !project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          Project not found
        </div>
      </div>
    );
  }

  const comparables = getComparablesByType(project, type);

  const handleRefreshComps = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/comps-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectFolderId: project.projectFolderId,
          type,
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch comps");
      const responseData = (await response.json()) as {
        comps: CompData[];
        imageMap: Record<string, ImageData[]>;
      };

      const data = responseData;
      if (!data) throw new Error("No data received");

      const rawComps = data.comps;
      const imageMap = data.imageMap ?? {};

      const newComps = rawComps.map((comp) => {
        const folderId = comp.folderId;
        const images =
          folderId && typeof folderId === "string"
            ? imageMap[folderId]
            : undefined;
        return {
          ...comp,
          images: images?.map((img) => {
            let fileId = img.id;
            if (!fileId || fileId === "anyoneWithLink") {
              const match = /\/d\/([a-zA-Z0-9_-]+)/.exec(img.webViewLink ?? "");
              if (match?.[1]) {
                fileId = match[1];
              }
            }
            return {
              ...img,
              webViewUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
            };
          }),
        };
      });

      const conflictsFound: MergeConflict[] = [];
      const newPendingComps: { comp: CompData; existingId?: string }[] = [];

      newComps.forEach((newComp) => {
        const newCompNumber = String(newComp["#"]);

        let existingComp = comparables.find((c) => c.number === newCompNumber);
        /* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
        existingComp ??= comparables.find(
          (c) =>
            c.address === newComp.Address ||
            (newComp.APN && (c.apn?.includes(newComp.APN) ?? false)) ||
            (newComp.Recording && c.instrumentNumber === newComp.Recording),
        );
        /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

        if (existingComp) {
          const fieldConflicts: MergeConflict["conflicts"] = [];

          if (newComp.Address && existingComp.address !== newComp.Address) {
            fieldConflicts.push({
              field: "Address",
              existingValue: existingComp.address,
              newValue: newComp.Address,
            });
          }

          const newApn = newComp.APN?.trim();
          const existingApn = existingComp.apn?.[0]?.trim();
          if (newApn && existingApn !== newApn) {
            fieldConflicts.push({
              field: "APN",
              existingValue: existingComp.apn?.join("\n"),
              newValue: newApn,
            });
          }

          if (
            newComp.Recording &&
            existingComp.instrumentNumber !== newComp.Recording
          ) {
            fieldConflicts.push({
              field: "Recording",
              existingValue: existingComp.instrumentNumber,
              newValue: newComp.Recording,
            });
          }

          if (fieldConflicts.length > 0) {
            conflictsFound.push({
              compNumber: Number(newComp["#"]) ?? 0,
              existingMsg: "Local Data",
              newMsg: "Refresh Data",
              existingData: {
                "#": Number(existingComp.number) ?? 0,
                Address: existingComp.address,
                APN: existingComp.apn?.join("\n"),
                Recording: existingComp.instrumentNumber,
                folderId: existingComp.folderId,
                images: existingComp.images,
              },
              newData: newComp,
              conflicts: fieldConflicts,
            });
          }

          newPendingComps.push({ comp: newComp, existingId: existingComp.id });
        } else {
          newPendingComps.push({ comp: newComp });
        }
      });

      if (conflictsFound.length > 0) {
        setMergeConflicts(conflictsFound);
        setPendingComps(newPendingComps);
      } else {
        updateProject((proj: ProjectData) => {
          const previousComparables = getComparablesByType(proj, type);

          const finalComparables: Comparable[] = newPendingComps.map(
            ({ comp: newComp, existingId }, i) => {
              if (existingId) {
                const existing = previousComparables.find(
                  (c) => c.id === existingId,
                );
                if (existing) {
                  return {
                    ...existing,
                    address: newComp.Address ?? existing.address,
                    addressForDisplay:
                      newComp.Address ?? existing.addressForDisplay,
                    apn: newComp.APN
                      ? newComp.APN.split("\n").filter((x) => x.trim())
                      : existing.apn,
                    instrumentNumber:
                      typeof newComp.Recording === "string"
                        ? newComp.Recording
                        : existing.instrumentNumber,
                    folderId: newComp.folderId ?? existing.folderId,
                    images: newComp.images ?? existing.images,
                    number: String(newComp["#"]),
                  };
                }
              }

              return {
                id: `comp-${type.toLowerCase()}-${Date.now()}-${i}-${Math.random()}`,
                number: String(newComp["#"]),
                type,
                address: newComp.Address ?? "",
                addressForDisplay: newComp.Address ?? "",
                apn: newComp.APN
                  ? newComp.APN.split("\n").filter((x) => x.trim())
                  : undefined,
                instrumentNumber:
                  typeof newComp.Recording === "string"
                    ? newComp.Recording
                    : undefined,
                folderId: newComp.folderId,
                images: newComp.images,
              };
            },
          );

          return {
            ...proj,
            comparables: [
              ...proj.comparables.filter((c) => c.type !== type),
              ...finalComparables,
            ],
          };
        });

        const addedCount = newPendingComps.filter((c) => !c.existingId).length;
        const removedCount =
          comparables.length -
          newPendingComps.filter((c) => c.existingId).length;

        alert(
          `Comparables refreshed.\nAdded: ${addedCount}\nRemoved: ${removedCount}\nUpdated: ${newPendingComps.length - addedCount}`,
        );
      }
    } catch (e) {
      console.error("Failed to refresh comps", e);
      alert("Failed to refresh comparables");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleMergeComplete = (
    decisions: Record<string, Record<string, "existing" | "new">>,
  ) => {
    if (!pendingComps) return;

    updateProject((proj: ProjectData) => {
      const previousComparables = getComparablesByType(proj, type);

      const finalComparables: Comparable[] = pendingComps.map(
        ({ comp: newComp, existingId }, i) => {
          if (existingId) {
            const existing = previousComparables.find(
              (c) => c.id === existingId,
            );
            if (existing) {
              const updatedComp = { ...existing };
              updatedComp.number = String(newComp["#"]);

              const compId = String(newComp["#"]);
              const compDecisions = decisions[compId] ?? {};

              const useNewAddress = (compDecisions.Address ?? "new") === "new";
              const useNewAPN = (compDecisions.APN ?? "new") === "new";
              const useNewRecording =
                (compDecisions.Recording ?? "new") === "new";

              if (useNewAddress && typeof newComp.Address === "string") {
                updatedComp.address = newComp.Address;
                updatedComp.addressForDisplay = newComp.Address;
              }

              if (useNewAPN && typeof newComp.APN === "string") {
                updatedComp.apn = newComp.APN.split("\n").filter((x) =>
                  x.trim(),
                );
              }

              if (useNewRecording && typeof newComp.Recording === "string") {
                updatedComp.instrumentNumber = newComp.Recording;
              }

              if (newComp.folderId) updatedComp.folderId = newComp.folderId;
              if (newComp.images) updatedComp.images = newComp.images;

              return updatedComp;
            }
          }

          return {
            id: `comp-${type.toLowerCase()}-${Date.now()}-${i}-${Math.random()}`,
            number: String(newComp["#"]),
            type,
            address: typeof newComp.Address === "string" ? newComp.Address : "",
            addressForDisplay:
              typeof newComp.Address === "string" ? newComp.Address : "",
            apn:
              typeof newComp.APN === "string"
                ? newComp.APN.split("\n").filter((x) => x.trim())
                : undefined,
            instrumentNumber:
              typeof newComp.Recording === "string"
                ? newComp.Recording
                : undefined,
            folderId: newComp.folderId,
            images: newComp.images,
          };
        },
      );

      return {
        ...proj,
        comparables: [
          ...proj.comparables.filter((c) => c.type !== type),
          ...finalComparables,
        ],
      };
    });

    setPendingComps(null);
    setMergeConflicts(null);
  };

  const handleAddComparable = () => {
    const id = `comp-${Date.now()}-${Math.random()}`;
    const newComparable: Comparable = {
      id,
      address: "",
      addressForDisplay: "",
      type,
    };
    updateProject((proj: ProjectData) => ({
      ...proj,
      comparables: [...proj.comparables, newComparable],
    }));
  };

  const handleComparableChange = (
    id: string,
    field: "address" | "addressForDisplay" | "apn",
    value: string,
  ) => {
    updateProject((proj: ProjectData) => ({
      ...proj,
      comparables: proj.comparables.map((comp) => {
        if (comp.id !== id || comp.type !== type) return comp;

        if (field === "apn") {
          return {
            ...comp,
            apn: value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          };
        }

        return { ...comp, [field]: value };
      }),
    }));
  };

  const handleRemoveComparable = (id: string) => {
    updateProject((proj: ProjectData) => {
      const mType = mapTypeForCompType(type);
      const compsMap = getMapByType(proj, mType);
      let maps = proj.maps.filter(
        (m) => !(m.type === "comp-location" && m.linkedCompId === id),
      );
      if (compsMap) {
        maps = maps.map((m) =>
          m.id === compsMap.id
            ? { ...m, markers: m.markers.filter((mk) => mk.compId !== id) }
            : m,
        );
      }
      return {
        ...proj,
        comparables: proj.comparables.filter((c) => c.id !== id),
        maps,
      };
    });
  };

  const handleAddressSearch = async (compId: string, address: string) => {
    if (!address.trim()) return;
    try {
      const geocoder = new google.maps.Geocoder();

      const applyGeocodeResult = (
        displayAddress: string,
        newPosition: { lat: number; lng: number },
      ) => {
        updateProject((proj: ProjectData) => {
          const mType = mapTypeForCompType(type);
          const mapView = getMapByType(proj, mType);

          if (!mapView) {
            return {
              ...proj,
              comparables: proj.comparables.map((c) =>
                c.id === compId
                  ? {
                      ...c,
                      address: displayAddress,
                      addressForDisplay: c.addressForDisplay || displayAddress,
                    }
                  : c,
              ),
            };
          }

          const existingMarker = mapView.markers.find(
            (m) => m.compId === compId,
          );
          const bubblePosition = existingMarker?.bubblePosition ?? {
            lat: newPosition.lat + 0.001,
            lng: newPosition.lng + 0.001,
          };
          const isTailPinned = existingMarker?.isTailPinned ?? true;
          const pinnedTailTipPosition =
            existingMarker?.pinnedTailTipPosition ??
            (isTailPinned ? newPosition : null);

          const nextMarker: MapMarker = {
            id: existingMarker?.id ?? `marker-${compId}-${mapView.id}`,
            mapId: mapView.id,
            compId,
            markerPosition: newPosition,
            bubblePosition,
            isTailPinned,
            pinnedTailTipPosition,
          };

          const maps = updateMapInProject(proj, mapView.id, (m) => ({
            ...m,
            markers: [
              ...m.markers.filter((mk) => mk.compId !== compId),
              nextMarker,
            ],
          }));

          return {
            ...proj,
            maps,
            comparables: proj.comparables.map((c) =>
              c.id === compId
                ? {
                    ...c,
                    address: displayAddress,
                    addressForDisplay: c.addressForDisplay || displayAddress,
                  }
                : c,
            ),
          };
        });
      };

      const decimalMatch =
        /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(address);
      if (decimalMatch) {
        const lat = Number(decimalMatch[1]);
        const lng = Number(decimalMatch[2]);
        const newPosition = { lat, lng };
        applyGeocodeResult(`${lat}, ${lng}`, newPosition);
        return;
      }

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
        const formattedAddress = results[0]?.formatted_address ?? address;
        applyGeocodeResult(formattedAddress, newPosition);
      }
    } catch (error) {
      console.error("Error geocoding comparable address:", error);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {decodedProjectId}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage {type.toLowerCase()} comparables.
          </p>
        </div>
        <button
          onClick={() => void handleRefreshComps()}
          disabled={isRefreshing}
          className="group flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className={`h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300 ${isRefreshing ? "animate-spin" : ""}`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          {isRefreshing ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {mergeConflicts && (
        <MergeCompsDialog
          conflicts={mergeConflicts}
          onMerge={handleMergeComplete}
          onClose={() => {
            setMergeConflicts(null);
            setPendingComps(null);
          }}
        />
      )}

      <APIProvider
        apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
        libraries={["drawing"]}
      >
        <ComparablesList
          projectId={projectId}
          type={type}
          comparables={comparables}
          onAdd={handleAddComparable}
          onRemove={handleRemoveComparable}
          onChange={handleComparableChange}
          onAddressSearch={handleAddressSearch}
        />
      </APIProvider>
    </div>
  );
}
