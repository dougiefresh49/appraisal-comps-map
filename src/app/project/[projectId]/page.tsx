"use client";

import { useEffect, useState, use, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  PROJECTS_STORAGE_KEY,
  CURRENT_PROJECT_STORAGE_KEY,
  normalizeProjectsMap,
  createDefaultProject,
  normalizeProjectData,
  COMPARABLE_TYPES,
  type ProjectData,
  type ProjectsMap,
  type SubjectInfo,
  type ComparableType,
  type ComparablesMapState,
  type ComparableInfo,
  type LocationMapState,
} from "~/utils/projectStore";

interface ProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

type EditableSubjectFields = keyof SubjectInfo;

export default function ProjectDashboard({ params }: ProjectPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);
  const projectName = decodedProjectId;

  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectsMap>({});
  const [projectExists, setProjectExists] = useState(false);
  const [activeMapType, setActiveMapType] = useState<ComparableType>("Land");
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    let projectStore: ProjectsMap = {};
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<string, Partial<ProjectData>>;
        projectStore = normalizeProjectsMap(parsed);
      } catch (error) {
        console.error("Failed to parse stored projects", error);
      }
    }

    setProjects(projectStore);
    
    if (projectStore[decodedProjectId]) {
      window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, decodedProjectId);
      setProjectExists(true);
      const project = normalizeProjectData(projectStore[decodedProjectId]);
      if (project.comparables.activeType) {
        setActiveMapType(project.comparables.activeType);
      }
    } else {
      setProjectExists(false);
    }
    
    setIsLoading(false);
  }, [decodedProjectId]);

  // Persist changes
  useEffect(() => {
    if (isLoading) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projects),
      );
    } catch (error) {
      console.error("Failed to persist projects", error);
    }
  }, [isLoading, projects]);

  const selectedProject = useMemo(() => {
    if (!projectName || !projects[projectName]) return undefined;
    return normalizeProjectData(projects[projectName]);
  }, [projects, projectName]);

  // JSON Mode sync
  useEffect(() => {
    if (!isJsonMode) return;
    if (!selectedProject) {
      setJsonValue("");
      return;
    }
    setJsonValue(JSON.stringify(selectedProject, null, 2));
    setJsonError(null);
  }, [isJsonMode, selectedProject]);


  const updateProject = useCallback(
    (updater: (project: ProjectData) => ProjectData) => {
      if (!projectName) return;
      setProjects((prev) => {
        const project = prev[projectName];
        if (!project) return prev;
        const normalized = normalizeProjectData(project);
        const updated = updater(normalized);
        return {
          ...prev,
          [projectName]: updated,
        };
      });
    },
    [projectName],
  );

  const handleSubjectChange = (field: EditableSubjectFields, value: string) => {
    updateProject((project) => {
      const updatedInfo = { ...project.subject.info, [field]: value };
      const updatedByType = COMPARABLE_TYPES.reduce<
        Record<ComparableType, ComparablesMapState>
      >(
        (acc, type) => {
          const currentState =
            project.comparables.byType[type] ??
            createDefaultProject().comparables.byType[type];
          acc[type] = {
            ...currentState,
          };
          return acc;
        },
        {} as Record<ComparableType, ComparablesMapState>,
      );

      return {
        ...project,
        subject: {
          ...project.subject,
          info: updatedInfo,
        },
        comparables: {
          ...project.comparables,
          byType: updatedByType,
        },
      };
    });
  };

  const handleAddComparable = (type: ComparableType) => {
    const id = `comp-${Date.now()}-${Math.random()}`;
    const newComparable: ComparableInfo = {
      id,
      address: "",
      addressForDisplay: "",
      isTailPinned: true,
      type,
    };
    updateProject((project) => {
      const currentState =
        project.comparables.byType[type] ??
        createDefaultProject().comparables.byType[type];
      return {
        ...project,
        comparables: {
          ...project.comparables,
          byType: {
            ...project.comparables.byType,
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
    type: ComparableType,
    id: string,
    field: "address" | "addressForDisplay",
    value: string,
  ) => {
    updateProject((project) => {
      const currentState =
        project.comparables.byType[type] ??
        createDefaultProject().comparables.byType[type];
      return {
        ...project,
        comparables: {
          ...project.comparables,
          byType: {
            ...project.comparables.byType,
            [type]: {
              ...currentState,
              comparables: (currentState.comparables ?? []).map((comp) =>
                comp.id === id ? { ...comp, [field]: value } : comp,
              ),
              landLocationMaps:
                type === "Land" && currentState.landLocationMaps
                  ? { ...currentState.landLocationMaps }
                  : currentState.landLocationMaps,
            },
          },
        },
      };
    });
  };

  const handleRemoveComparable = (type: ComparableType, id: string) => {
    updateProject((project) => {
      const currentState =
        project.comparables.byType[type] ??
        createDefaultProject().comparables.byType[type];
      return {
        ...project,
        comparables: {
          ...project.comparables,
          byType: {
            ...project.comparables.byType,
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

  const handleJsonApply = () => {
    if (!projectName) return;
    try {
      const parsed = JSON.parse(jsonValue) as Partial<ProjectData>;
      const normalized = normalizeProjectData(parsed);
      setProjects((prev) => ({
        ...prev,
        [projectName]: normalized,
      }));
      setJsonError(null);
    } catch (error) {
      console.error("Failed to parse project JSON", error);
      setJsonError(
        error instanceof Error ? error.message : "Unknown JSON parse error",
      );
    }
  };

  const handleSetActiveMapType = (type: ComparableType) => {
     setActiveMapType(type);
     updateProject((project) => ({
      ...project,
      comparables: {
        ...project.comparables,
        activeType: type,
      },
    }));
  };

  const comparablesByType = useMemo(() => {
    if (!selectedProject) {
      return COMPARABLE_TYPES.reduce<Record<ComparableType, ComparableInfo[]>>(
        (acc, type) => {
          acc[type] = [];
          return acc;
        },
        {} as Record<ComparableType, ComparableInfo[]>,
      );
    }
    return COMPARABLE_TYPES.reduce<Record<ComparableType, ComparableInfo[]>>(
      (acc, type) => {
        const list =
          selectedProject.comparables.byType[type]?.comparables ?? [];
        acc[type] = list.map((comparable) => ({
          ...comparable,
          type: comparable.type ?? type,
        }));
        return acc;
      },
      {} as Record<ComparableType, ComparableInfo[]>,
    );
  }, [selectedProject]);


  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading project...</div>
      </div>
    );
  }

  if (!projectExists || !selectedProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-gray-900">Project Not Found</h2>
        <p className="text-gray-600">The project &quot;{decodedProjectId}&quot; does not exist.</p>
        <Link 
          href="/projects" 
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {projectName}
          </h2>
          <p className="text-sm text-gray-500">
            Manage subject details and property comparables.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsJsonMode((prev) => !prev)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            {isJsonMode ? "Form View" : "JSON View"}
          </button>
        </div>
      </div>

       {isJsonMode && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold text-gray-800">
              Project JSON Data
            </h3>
            <p className="mb-4 text-xs text-gray-500">
              Edit the raw JSON data for this project. Be careful!
            </p>
            <textarea
              value={jsonValue}
              onChange={(e) => setJsonValue(e.target.value)}
              className="h-96 w-full rounded-md border border-gray-300 p-4 font-mono text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            {jsonError && (
              <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-600">
                {jsonError}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setIsJsonMode(false)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleJsonApply}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {!isJsonMode && (
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">
              Subject Information
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                  Address
                </label>
                <input
                  type="text"
                  value={selectedProject.subject.info.address}
                  onChange={(event) =>
                    handleSubjectChange("address", event.target.value)
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="123 Main St, Odessa, TX 79761"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                  Address (Display)
                </label>
                <input
                  type="text"
                  value={selectedProject.subject.info.addressForDisplay ?? ""}
                  onChange={(event) =>
                    handleSubjectChange(
                      "addressForDisplay",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="Display name for subject..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                  Legal Description
                </label>
                <input
                  type="text"
                  value={selectedProject.subject.info.legalDescription ?? ""}
                  onChange={(event) =>
                    handleSubjectChange(
                      "legalDescription",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="Legal description..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                  Acres
                </label>
                <input
                  type="text"
                  value={selectedProject.subject.info.acres ?? ""}
                  onChange={(event) =>
                    handleSubjectChange("acres", event.target.value)
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="9.834"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                  Subject Photos Folder ID
                </label>
                <input
                  type="text"
                  value={selectedProject.subjectPhotosFolderId ?? ""}
                  onChange={(event) => {
                    updateProject((project) => ({
                      ...project,
                      subjectPhotosFolderId: event.target.value,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="1a2b3c4d5e6f7g8h9i0j"
                />
                {selectedProject.subjectPhotosFolderId && (
                  <Link
                    href={`/project/${projectId}/subject/photos?folderId=${encodeURIComponent(selectedProject.subjectPhotosFolderId)}${selectedProject.projectFolderId ? `&projectFolderId=${encodeURIComponent(selectedProject.projectFolderId)}` : ""}`}
                    className="mt-2 inline-block rounded-md border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                  >
                    View Photos
                  </Link>
                )}
              </div>
              {/* Other metadata fields */}
               <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Client Company
                  </label>
                  <input
                    type="text"
                    value={selectedProject.clientCompany ?? ""}
                    onChange={(event) => {
                      updateProject((project) => ({
                        ...project,
                        clientCompany: event.target.value,
                      }));
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Winkler County Hospital District"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Client Name
                  </label>
                  <input
                    type="text"
                    value={selectedProject.clientName ?? ""}
                    onChange={(event) => {
                      updateProject((project) => ({
                        ...project,
                        clientName: event.target.value,
                      }));
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Lorenzo Serrano"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Property Type
                  </label>
                  <input
                    type="text"
                    value={selectedProject.propertyType ?? ""}
                    onChange={(event) => {
                      updateProject((project) => ({
                        ...project,
                        propertyType: event.target.value,
                      }));
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Commercial Office Building"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Project Folder ID
                  </label>
                  <input
                    type="text"
                    value={selectedProject.projectFolderId ?? ""}
                    onChange={(event) => {
                      updateProject((project) => ({
                        ...project,
                        projectFolderId: event.target.value,
                      }));
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Project folder ID"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Used to fetch cover page data
                  </p>
                </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Comparable Properties
              </h3>
              <div className="flex gap-2">
                {COMPARABLE_TYPES.map((type) => (
                  <button
                    key={`active-${type}`}
                    onClick={() => handleSetActiveMapType(type)}
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                      type === activeMapType
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Active: {type}
                  </button>
                ))}
              </div>
            </div>

            <p className="mb-4 text-xs text-gray-500">
              Each comparable type maintains its own markers, shapes, and map
              settings.
            </p>

            <div className="space-y-6">
              {COMPARABLE_TYPES.map((type) => {
                const list = comparablesByType[type];
                return (
                  <div
                    key={type}
                    className="rounded-md border border-gray-200 bg-gray-50 p-4 shadow-inner"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">
                        {type} Comparables ({list.length})
                      </span>
                      <button
                        onClick={() => handleAddComparable(type)}
                        className="rounded-md border border-blue-500 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                      >
                        + Add {type}
                      </button>
                    </div>

                    {list.length === 0 ? (
                      <div className="rounded-md border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-500">
                        No {type.toLowerCase()} comparables yet.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {list.map((comparable, index) => (
                          <div
                            key={comparable.id}
                            className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"
                          >
                            <div className="mb-3 flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-700">
                                {type} Comparable {index + 1}
                              </span>
                              <div className="flex items-center gap-2">
                                {type === "Land" && (
                                  <Link
                                    href={`/project/${projectId}/land-sales/comps/${comparable.id}/location-map`}
                                    className="rounded-md border border-green-600 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 transition hover:bg-green-100"
                                  >
                                    Land Map
                                  </Link>
                                )}
                                <button
                                  onClick={() =>
                                    handleRemoveComparable(
                                      type,
                                      comparable.id,
                                    )
                                  }
                                  className="text-xs font-medium text-red-600 hover:text-red-700"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                                  Address
                                </label>
                                <input
                                  type="text"
                                  value={comparable.address}
                                  onChange={(event) =>
                                    handleComparableChange(
                                      type,
                                      comparable.id,
                                      "address",
                                      event.target.value,
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                  placeholder="Comparable address..."
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                                  Address (Display)
                                </label>
                                <input
                                  type="text"
                                  value={comparable.addressForDisplay}
                                  onChange={(event) =>
                                    handleComparableChange(
                                      type,
                                      comparable.id,
                                      "addressForDisplay",
                                      event.target.value,
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                  placeholder="Comparable display address..."
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
