"use client";

import { useProject } from "~/hooks/useProject";
import { ComparablesList } from "./ComparablesList";
import { APIProvider } from "@vis.gl/react-google-maps";
import { env } from "~/env";
import {
  type ComparableType,
  createDefaultProject,
  type ComparableInfo,
  type ComparablesMapState,
  type LocationMapState
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

  const handleAddComparable = () => {
    const id = `comp-${Date.now()}-${Math.random()}`;
    const newComparable: ComparableInfo = {
      id,
      address: "",
      addressForDisplay: "",
      isTailPinned: true,
      type,
    };
    updateProject((proj) => {
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
    updateProject((proj) => {
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
    updateProject((proj) => {
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
          
          updateProject((proj) => {
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

           updateProject((proj) => {
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
                                    address: formattedAddress,
                                    addressForDisplay: comp.addressForDisplay || formattedAddress,
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
      }
    } catch (error) { 
        console.error("Error geocoding comparable address:", error); 
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{decodedProjectId}</h2>
        <p className="text-sm text-gray-500">Manage {type.toLowerCase()} comparables.</p>
      </div>
      
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
