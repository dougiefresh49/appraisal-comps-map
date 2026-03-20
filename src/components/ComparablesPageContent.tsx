"use client";

import { MergeCompsDialog, type MergeConflict, type CompData } from "./MergeCompsDialog";
import { useState } from "react";
import { useProject } from "~/hooks/useProject";
import { ComparablesList } from "./ComparablesList";
import { APIProvider } from "@vis.gl/react-google-maps";
import { env } from "~/env";
import {
  type ComparableType,
  createDefaultProject,
  type ComparableInfo,
  type LocationMapState,
  type ProjectData,
  type ImageData
} from "~/utils/projectStore";

interface ComparablesPageContentProps {
  projectId: string;
  type: ComparableType;
}

export function ComparablesPageContent({
  projectId,
  type,
}: ComparablesPageContentProps) {
  const { project, updateProject, isLoading, projectExists } = useProject(projectId);
  const decodedProjectId = decodeURIComponent(projectId);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[] | null>(null);
  const [pendingComps, setPendingComps] = useState<{ comp: CompData; existingId?: string }[] | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading project...</div>
      </div>
    );
  }

  if (!projectExists || !project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Project not found</div>
      </div>
    );
  }

  const comparables = project.comparables.byType[type]?.comparables ?? [];

  const handleRefreshComps = async () => {
    setIsRefreshing(true);
    try {
        const response = await fetch("/api/comps-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectFolderId: project.projectFolderId,
                type, // "Sales", "Land", etc.
            }),
        });

        if (!response.ok) throw new Error("Failed to fetch comps");
        const responseData = (await response.json()) as { comps: CompData[]; imageMap: Record<string, ImageData[]> };
        
        // Handle the array response structure - assume first item contains the data we need or flatten if needed
        // Based on example: [ { comps: [], imageMap: {} } ]
        const data = responseData;
        if (!data) throw new Error("No data received");

        const rawComps = data.comps;
        const imageMap = data.imageMap ?? {};
        console.log("imageMap received:", imageMap);
        console.log("rawComps received:", rawComps);

        // Pre-process comps to attach images
        const newComps = rawComps.map(comp => {
            const folderId = comp.folderId;
            const images = folderId && typeof folderId === 'string' ? imageMap[folderId] : undefined;
            return {                                                                                                                                                                                                                                                                   
                ...comp,
                images: images?.map(img => {
                    let fileId = img.id;
                    // Fix for malformed IDs (e.g., "anyoneWithLink") from N8N
                    if (!fileId || fileId === "anyoneWithLink") {
                         const match = /\/d\/([a-zA-Z0-9_-]+)/.exec(img.webViewLink ?? "");
                         if (match?.[1]) {
                             fileId = match[1];
                         }
                    }
                    return { ...img, webViewUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w800` };
                })
            };
        });

        // Wait, the prompt says: "check the comp numbers in the local store and then compare to the CompData['#'] field"
        // This implies the local store *should* have comp numbers. 
        // In `src/app/projects/new/page.tsx`, we map `CompData` to `ComparableInfo`.
        // We do NOT seem to store the `#` in `ComparableInfo`.
        // This is a potential issue. 
        // However, we can try to infer it or just fallback to Address matching.
        // Let's proceed with Address matching as the most robust alternative available.
        
        // Actually, looking at `projects/new/page.tsx` conversion:
        // id: `comp-${type.toLowerCase()}-${Date.now()}-${index}-${Math.random()}`
        // It doesn't store the #.
        // I will implement matching by Address first. 
        
        const conflictsFound: MergeConflict[] = [];

        // Identify conflicts and prepare pending structure
        // We will construct the "new" list of comparables based on the API response.
        // If a comp exists in API but not local -> New.
        // If a comp exists in local but not API -> Removed (implicitly, by not including it in the new list).
        // If matches -> Check conflicts.

        const newPendingComps: { comp: CompData; existingId?: string }[] = [];

        newComps.forEach(newComp => {
             const newCompNumber = String(newComp['#']);
             
             // Match by 'number' field
             let existingComp = comparables.find(c => c.number === newCompNumber);
             console.log("existingComp by number:", existingComp);
             console.log("newCompNumber:", newCompNumber);
             // Fallback: If not found by number (e.g. legacy data), try matching by unique fields
             existingComp ??= comparables.find(c => 
                c.address === newComp.Address || 
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                (newComp.APN && (c.apn?.includes(newComp.APN) ?? false)) ||
                (newComp.Recording && c.instrumentNumber === newComp.Recording)
             );

             if (existingComp) {
                 // Check for conflicts
                 const fieldConflicts: MergeConflict["conflicts"] = [];
                 
                 // Address Conflict
                 if (newComp.Address && existingComp.address !== newComp.Address) {
                     fieldConflicts.push({ field: "Address", existingValue: existingComp.address, newValue: newComp.Address });
                 }
                 
                 // APN Conflict (simplified check)
                 const newApn = newComp.APN?.trim();
                 const existingApn = existingComp.apn?.[0]?.trim(); // Take first for comparison
                 if (newApn && existingApn !== newApn) {
                      fieldConflicts.push({ field: "APN", existingValue: existingComp.apn?.join("\n"), newValue: newApn });
                 }

                 // Recording/Instrument Conflict
                 if (newComp.Recording && existingComp.instrumentNumber !== newComp.Recording) {
                     fieldConflicts.push({ field: "Recording", existingValue: existingComp.instrumentNumber, newValue: newComp.Recording });
                 }

                if (fieldConflicts.length > 0) {
                     conflictsFound.push({
                         compNumber: Number(newComp['#']) ?? 0,
                         existingMsg: "Local Data",
                         newMsg: "Refresh Data",
                         existingData: { 
                             '#': Number(existingComp.number) ?? 0, 
                             Address: existingComp.address, 
                             APN: existingComp.apn?.join("\n"), 
                             Recording: existingComp.instrumentNumber,
                             folderId: existingComp.folderId,
                             images: existingComp.images 
                         },
                         newData: newComp,
                         conflicts: fieldConflicts
                     });
                 }
                 
                 newPendingComps.push({ comp: newComp, existingId: existingComp.id });
             } else {
                 // New Comp
                 newPendingComps.push({ comp: newComp });
             }
        });

        if (conflictsFound.length > 0) {
            setMergeConflicts(conflictsFound);
            setPendingComps(newPendingComps); 
        } else {
             updateProject((proj: ProjectData) => {
                const currentState = proj.comparables.byType[type] ?? createDefaultProject().comparables.byType[type];
                const previousComparables = currentState.comparables ?? [];
                
                // Construct the NEW list of comparables, preserving IDs/MapState for existing matches
                const finalComparables: ComparableInfo[] = newPendingComps.map(({ comp: newComp, existingId }, i) => {
                     // eslint-disable-next-line @typescript-eslint/no-unused-vars
                     let baseComp: ComparableInfo;
                     
                     if (existingId) {
                         const existing = previousComparables.find(c => c.id === existingId);
                         if (existing) {
                             // Preserve existing state, apply allowed updates (images, folderId)
                             // Note: If there were NO conflicts, we can arguably apply ALL updates?
                             // The prompt implies "if there are conflicts... show dialog". 
                             // If we are here, there are NO conflicts found (or we ignored them? No, we branched above).
                             // So we should assume "Accept Incoming" for all fields if we are here?
                             // Logic: If no conflicts found, it means fields match OR we just auto-update?
                             // Actually, if no conflict, we can just keep existing OR overwrite. 
                             // Let's overwrite to ensure sync.
                             
                             return {
                                 ...existing,
                                 // Update fields to match incoming (in case of type/formatting diffs we missed, or just to sync)
                                 address: newComp.Address ?? existing.address,
                                 addressForDisplay: newComp.Address ?? existing.addressForDisplay,
                                 apn: newComp.APN ? newComp.APN.split("\n").filter(x => x.trim()) : existing.apn,
                                 instrumentNumber: newComp.Recording ?? existing.instrumentNumber,
                                 folderId: newComp.folderId ?? existing.folderId,
                                 images: newComp.images ?? existing.images,
                                 number: String(newComp['#'])
                             };
                         }
                     }

                     // Completely New
                     return {
                             id: `comp-${type.toLowerCase()}-${Date.now()}-${i}-${Math.random()}`,
                             number: String(newComp['#']),
                             address: newComp.Address ?? "",
                             addressForDisplay: newComp.Address ?? "",
                             isTailPinned: true,
                             type: type,
                             apn: newComp.APN ? newComp.APN.split("\n").filter(x => x.trim()) : undefined,
                             instrumentNumber: newComp.Recording,
                             folderId: newComp.folderId,
                             images: newComp.images
                     };
                });
                
                return {
                    ...proj,
                    comparables: {
                        ...proj.comparables,
                        byType: {
                            ...proj.comparables.byType,
                            [type]: {
                                ...currentState,
                                comparables: finalComparables,
                            },
                        },
                    },
                };
            });
            
            // Alert logic
            const addedCount = newPendingComps.filter(c => !c.existingId).length;
            const removedCount = comparables.length - newPendingComps.filter(c => c.existingId).length;
            
            alert(`Comparables refreshed.\nAdded: ${addedCount}\nRemoved: ${removedCount}\nUpdated: ${newPendingComps.length - addedCount}`);
        }

    } catch (e) {
        console.error("Failed to refresh comps", e);
        alert("Failed to refresh comparables");
    } finally {
        setIsRefreshing(false);
    }
  };

  const handleMergeComplete = (decisions: Record<string, Record<string, "existing" | "new">>) => {
       if (!pendingComps) return;
       
       console.log("Handling Merge Complete. Decisions:", decisions);
       console.log("Pending Comps:", pendingComps);

       updateProject((proj: ProjectData) => {
            const currentState = proj.comparables.byType[type] ?? createDefaultProject().comparables.byType[type];
            const previousComparables = currentState.comparables ?? [];
            
            const finalComparables: ComparableInfo[] = pendingComps.map(({ comp: newComp, existingId }, i) => {
                if (existingId) {
                    const existing = previousComparables.find(c => c.id === existingId);
                    if (existing) {
                        const updatedComp = { ...existing };
                        updatedComp.number = String(newComp['#']); // Ensure number is synced
                        
                        // Check decisions
                        // Check decisions
                        const compId = String(newComp['#']);
                        const compDecisions = decisions[compId] ?? {};

                        // Default to 'new' (Accept Incoming) if no explicit decision made
                        // This matches the UI which shows 'Accept Incoming' selected by default
                        const useNewAddress = (compDecisions.Address ?? "new") === "new";
                        const useNewAPN = (compDecisions.APN ?? "new") === "new";
                        const useNewRecording = (compDecisions.Recording ?? "new") === "new";
                        
                        if (useNewAddress && typeof newComp.Address === 'string') {
                            updatedComp.address = newComp.Address;
                            updatedComp.addressForDisplay = newComp.Address;
                        }

                        if (useNewAPN && typeof newComp.APN === 'string') {
                            updatedComp.apn = newComp.APN.split("\n").filter(x => x.trim());
                        }

                        if (useNewRecording && typeof newComp.Recording === 'string') {
                            updatedComp.instrumentNumber = newComp.Recording;
                        }
                        
                        // Always update images/folderId/number
                        if (newComp.folderId) updatedComp.folderId = newComp.folderId;
                        if (newComp.images) updatedComp.images = newComp.images;
                        
                        return updatedComp;
                    }
                }
                
                // New Comp
                return {
                     id: `comp-${type.toLowerCase()}-${Date.now()}-${i}-${Math.random()}`,
                     number: String(newComp['#']),
                     address: typeof newComp.Address === 'string' ? newComp.Address : "",
                     addressForDisplay: typeof newComp.Address === 'string' ? newComp.Address : "",
                     isTailPinned: true,
                     type: type,
                     apn: typeof newComp.APN === 'string' ? newComp.APN.split("\n").filter(x => x.trim()) : undefined,
                     instrumentNumber: typeof newComp.Recording === 'string' ? newComp.Recording : undefined,
                     folderId: newComp.folderId,
                     images: newComp.images
                };
            });

            return {
                ...proj,
                comparables: {
                    ...proj.comparables,
                    byType: {
                        ...proj.comparables.byType,
                        [type]: {
                            ...currentState,
                            comparables: finalComparables,
                        },
                    },
                },
            };
       });
       
       setPendingComps(null);
       setMergeConflicts(null);
  };

  const handleAddComparable = () => {
    const id = `comp-${Date.now()}-${Math.random()}`;
    const newComparable: ComparableInfo = {
      id,
      address: "",
      addressForDisplay: "",
      isTailPinned: true,
      type,
    };
    updateProject((proj: ProjectData) => {
      const currentState =
        proj.comparables.byType[type] ??
        createDefaultProject().comparables.byType[type];
      return {
        ...proj,
        comparables: {
          ...proj.comparables,
          byType: {
            ...proj.comparables.byType,
            [type]: {
              ...currentState,
              comparables: [...(currentState.comparables ?? []), newComparable],
            },
          },
        },
      };
    });
  };

  const handleComparableChange = (
    id: string,
    field: "address" | "addressForDisplay" | "apn",
    value: string,
  ) => {
    updateProject((proj: ProjectData) => {
      const currentState =
        proj.comparables.byType[type] ??
        createDefaultProject().comparables.byType[type];
      
      return {
        ...proj,
        comparables: {
          ...proj.comparables,
          byType: {
            ...proj.comparables.byType,
            [type]: {
              ...currentState,
              comparables: (currentState.comparables ?? []).map((comp) => {
                 if (comp.id !== id) return comp;
                 
                 if (field === "apn") {
                     return { ...comp, apn: value.split(",").map(s => s.trim()).filter(Boolean) };
                 }
                 
                 return { ...comp, [field]: value };
              }),
            },
          },
        },
      };
    });
  };

  const handleRemoveComparable = (id: string) => {
    updateProject((proj: ProjectData) => {
      const currentState =
        proj.comparables.byType[type] ??
        createDefaultProject().comparables.byType[type];
      return {
        ...proj,
        comparables: {
          ...proj.comparables,
          byType: {
            ...proj.comparables.byType,
            [type]: {
              ...currentState,
              comparables: (currentState.comparables ?? []).filter(
                (comp) => comp.id !== id,
              ),
              landLocationMaps:
                type === "Land" && currentState.landLocationMaps
                  ? Object.entries(currentState.landLocationMaps).reduce<
                      Record<string, LocationMapState>
                    >((acc, [key, value]) => {
                      if (key !== id) {
                        acc[key] = value;
                      }
                      return acc;
                    }, {})
                  : currentState.landLocationMaps,
            },
          },
        },
      };
    });
  };

  const handleAddressSearch = async (compId: string, address: string) => {
    if (!address.trim()) return;
    try {
      const geocoder = new google.maps.Geocoder();
      
      // Check for decimal coordinates first
      const decimalMatch = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(address);
      if (decimalMatch) {
          const lat = Number(decimalMatch[1]);
          const lng = Number(decimalMatch[2]);
          const newPosition = { lat, lng };
          
          updateProject((proj: ProjectData) => {
             const currentState = proj.comparables.byType[type] ?? createDefaultProject().comparables.byType[type];
             return {
                ...proj,
                comparables: {
                    ...proj.comparables,
                    byType: {
                        ...proj.comparables.byType,
                        [type]: {
                            ...currentState,
                            comparables: (currentState.comparables ?? []).map((comp) => {
                                if (comp.id !== compId) return comp;
                                return {
                                    ...comp,
                                    address: `${lat}, ${lng}`,
                                    markerPosition: newPosition,
                                    position: comp.position ?? { lat: newPosition.lat + 0.001, lng: newPosition.lng + 0.001 },
                                    pinnedTailTipPosition: comp.pinnedTailTipPosition ?? (comp.isTailPinned ? newPosition : undefined)
                                };
                            })
                        }
                    }
                }
             };
          });
          return;
      }

      const results = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
          void geocoder.geocode({ address }, (results, status) => { 
              if (status === google.maps.GeocoderStatus.OK && results) resolve(results); 
              else reject(new Error(`Geocoding failed: ${status}`)); 
          });
      });

      if (results && results.length > 0) {
           const location = results[0]!.geometry.location;
           const newPosition = { lat: location.lat(), lng: location.lng() };
           const formattedAddress = results[0]?.formatted_address ?? address;

           updateProject((proj: ProjectData) => {
             const currentState = proj.comparables.byType[type] ?? createDefaultProject().comparables.byType[type];
             
             // Safer update mapping
             const updatedComparables = (currentState.comparables ?? []).map((comp): ComparableInfo => {
                 if (comp.id !== compId) return comp;
                 return {
                     ...comp,
                     address: formattedAddress,
                     addressForDisplay: comp.addressForDisplay ?? formattedAddress,
                     markerPosition: newPosition,
                     position: comp.position ?? { lat: newPosition.lat + 0.001, lng: newPosition.lng + 0.001 },
                     pinnedTailTipPosition: comp.pinnedTailTipPosition ?? (comp.isTailPinned ? newPosition : undefined)
                 };
             });

             return {
                ...proj,
                 comparables: {
                    ...proj.comparables,
                    byType: {
                        ...proj.comparables.byType,
                        [type]: {
                            ...currentState,
                            comparables: updatedComparables
                        }
                    }
                }
             };
          });
      }
    } catch (error) { 
        console.error("Error geocoding comparable address:", error); 
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{decodedProjectId}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage {type.toLowerCase()} comparables.</p>
        </div>
         <button
            onClick={() => void handleRefreshComps()}
            disabled={isRefreshing}
            className="group flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
        >
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                strokeWidth={1.5} 
                stroke="currentColor" 
                className={`h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300 ${isRefreshing ? 'animate-spin' : ''}`}
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {isRefreshing ? "Refreshing..." : "Refresh Data"}
        </button>  
      </div>
      
      {mergeConflicts && (
         <MergeCompsDialog 
            conflicts={mergeConflicts}
            onMerge={handleMergeComplete}
            onClose={() => { setMergeConflicts(null); setPendingComps(null); }}
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
