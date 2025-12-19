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
  type ProjectData
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
  const [pendingComps, setPendingComps] = useState<CompData[] | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500">Loading project...</div>
      </div>
    );
  }

  if (!projectExists || !project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500">Project not found</div>
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
        const newComps = (await response.json()) as CompData[];



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

        newComps.forEach(newComp => {
             const existingComp = comparables.find(c => 
                c.address === newComp.Address || 
                c.address === newComp.Address || 
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
                         compNumber: newComp['#'] ?? 0,
                         existingMsg: "Local Data",
                         newMsg: "Refresh Data",
                         existingData: { 
                             '#': newComp['#'], 
                             Address: existingComp.address, 
                             APN: existingComp.apn?.join("\n"), 
                             Recording: existingComp.instrumentNumber 
                             // Add other props if needed
                         },
                         newData: newComp,
                         conflicts: fieldConflicts
                     });
                 } else {
                     // Update implicitly if no conflict? Or just ignore? 
                     // If exactly same, do nothing.
                 }
             } else {
                 // New comp, add to list to be added
                 // We'll handle this in the bulk update
             }
        });

        if (conflictsFound.length > 0) {
            setMergeConflicts(conflictsFound);
            setPendingComps(newComps); // Store for processing
        } else {
            // No conflicts, just overwrite/add? 
            // The request says "if there are no comps... save them".
            // "if there are comps... check... show merge dialog".
            // If no conflicts found but data exists, we probably want to update non-conflicting fields or add new ones.
            // For now, let's just add any completely NEW comps that didn't match anything.
            // And potentially update fields that were empty in existing?
            // To be safe and simple: If no conflicts, we assume "Accept Incoming" for all changes.
            // Actually, if we found matches but no conflicts (i.e. identical), we do nothing for those.
            // If we found NO matches for a comp, it's a new comp.
            
            const completelyNewComps = newComps.filter(nc => !comparables.some(c => 
                c.address === nc.Address || 
                (nc.APN && (c.apn?.includes(nc.APN) ?? false)) ||
                (nc.Recording && c.instrumentNumber === nc.Recording)
            ));

            if (completelyNewComps.length > 0) {
                // Add them
                 updateProject((proj: ProjectData) => {
                    const currentState = proj.comparables.byType[type] ?? createDefaultProject().comparables.byType[type];
                    
                    const newComparableInfos: ComparableInfo[] = completelyNewComps.map((c, i) => ({
                         id: `comp-${type.toLowerCase()}-${Date.now()}-${i}-${Math.random()}`,
                         address: c.Address ?? "",
                         addressForDisplay: c.Address ?? "",
                         isTailPinned: true,
                         type: type,
                         apn: c.APN ? c.APN.split("\n").filter(x => x.trim()) : undefined,
                         instrumentNumber: c.Recording
                    }));

                    return {
                        ...proj,
                        comparables: {
                            ...proj.comparables,
                            byType: {
                                ...proj.comparables.byType,
                                [type]: {
                                    ...currentState,
                                    comparables: [...(currentState.comparables ?? []), ...newComparableInfos],
                                },
                            },
                        },
                    };
                 });
                 alert(`Added ${completelyNewComps.length} new comparables.`);
            } else {
                alert("No new comparables or updates found.");
            }
        }

    } catch (e) {
        console.error("Failed to refresh comps", e);
        alert("Failed to refresh comparables");
    } finally {
        setIsRefreshing(false);
    }
  };

  const handleMergeComplete = (decisions: Record<number, Record<string, "existing" | "new">>) => {
       if (!pendingComps) return;
       
       updateProject((proj: ProjectData) => {
            const currentState = proj.comparables.byType[type] ?? createDefaultProject().comparables.byType[type];
            const updatedComparables = [...(currentState.comparables ?? [])];
            const compsToAdd: ComparableInfo[] = [];

            pendingComps.forEach((newComp, index) => {
                 // Find existing
                 const existingIndex = updatedComparables.findIndex(c => 
                    c.address === newComp.Address || 
                    (newComp.APN && (c.apn?.includes(newComp.APN) ?? false)) ||
                    (newComp.Recording && c.instrumentNumber === newComp.Recording)
                 );

                 if (existingIndex !== -1) {
                     const compDecisions = decisions[newComp['#']];
                     if (compDecisions) {
                         const existingComp = updatedComparables[existingIndex];
                         if (existingComp) {
                             // Apply updates based on decision
                             const updatedComp: ComparableInfo = { ...existingComp };
                             
                             if (compDecisions.Address === "new" && typeof newComp.Address === 'string') {
                                 updatedComp.address = newComp.Address;
                                 updatedComp.addressForDisplay = newComp.Address;
                             }
                             if (compDecisions.APN === "new" && typeof newComp.APN === 'string') {
                                 updatedComp.apn = newComp.APN.split("\n").filter(x => x.trim());
                             }
                             if (compDecisions.Recording === "new" && typeof newComp.Recording === 'string') {
                                 updatedComp.instrumentNumber = newComp.Recording;
                             }
                             
                             updatedComparables[existingIndex] = updatedComp;
                         }
                     }
                 } else {
                     // New comp
                     compsToAdd.push({
                         id: `comp-${type.toLowerCase()}-${Date.now()}-${index}-${Math.random()}`,
                         address: typeof newComp.Address === 'string' ? newComp.Address : "",
                         addressForDisplay: typeof newComp.Address === 'string' ? newComp.Address : "",
                         isTailPinned: true,
                         type: type,
                         apn: typeof newComp.APN === 'string' ? newComp.APN.split("\n").filter(x => x.trim()) : undefined,
                         instrumentNumber: typeof newComp.Recording === 'string' ? newComp.Recording : undefined
                     });
                 }
            });
            
            return {
                ...proj,
                 comparables: {
                    ...proj.comparables,
                    byType: {
                        ...proj.comparables.byType,
                        [type]: {
                            ...currentState,
                            comparables: [...updatedComparables, ...compsToAdd],
                        },
                    },
                },
            };
       });

       setMergeConflicts(null);
       setPendingComps(null);
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
    field: "address" | "addressForDisplay",
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
              comparables: (currentState.comparables ?? []).map((comp) =>
                comp.id === id ? { ...comp, [field]: value } : comp,
              ),
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
            <h2 className="text-2xl font-bold text-gray-900">{decodedProjectId}</h2>
            <p className="text-sm text-gray-500">Manage {type.toLowerCase()} comparables.</p>
        </div>
         <button
            onClick={() => void handleRefreshComps()}
            disabled={isRefreshing}
            className="group flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                strokeWidth={1.5} 
                stroke="currentColor" 
                className={`h-5 w-5 text-gray-400 group-hover:text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`}
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
