"use client";

import { useState, use, useMemo } from "react";
import Link from "next/link";
import {
  normalizeProjectData,
  COMPARABLE_TYPES,
  type ProjectData,
  type ComparableType,
  type ComparableInfo,
} from "~/utils/projectStore";
import { useProject } from "~/hooks/useProject";

import { JsonViewer } from "~/components/JsonViewer";

interface ProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

type EditableSubjectFields = "address" | "addressForDisplay" | "legalDescription" | "acres";

export default function ProjectDashboard({ params }: ProjectPageProps) {
  const { projectId } = use(params);
  const { project: selectedProject, updateProject, isLoading, projectExists } = useProject(projectId);
  const decodedProjectId = decodeURIComponent(projectId);
  const projectName = decodedProjectId;


  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // JSON Mode sync
  useMemo(() => {
    if (!isJsonMode) return;
    if (!selectedProject) {
      setJsonValue("");
      return;
    }
    setJsonValue(JSON.stringify(selectedProject, null, 2));
    setJsonError(null);
  }, [isJsonMode, selectedProject]);

  const handleSubjectChange = (field: EditableSubjectFields, value: string) => {
    updateProject((project) => {
      const updatedInfo = { ...project.subject.info, [field]: value };
      return {
        ...project,
        subject: {
          ...project.subject,
          info: updatedInfo,
        },
      };
    });
  };

  const handleJsonApply = () => {
    if (!projectName) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(jsonValue);
      const normalized = normalizeProjectData(parsed as Partial<ProjectData>);
      
      // We need to update the entire project state.
      // The updateProject function expects a transformer, but we have a new state.
      // We can just return the new state.
      updateProject(() => normalized);
      
      setJsonError(null);
    } catch (error) {
      console.error("Failed to parse project JSON", error);
      setJsonError(
        error instanceof Error ? error.message : "Unknown JSON parse error",
      );
    }
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
        <div className="text-gray-500 dark:text-gray-400">Loading project...</div>
      </div>
    );
  }

  if (!projectExists || !selectedProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Project Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400">The project &quot;{decodedProjectId}&quot; does not exist.</p>
        <Link 
          href="/projects" 
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {projectName}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage subject details and property comparables.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsJsonMode((prev) => !prev)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {isJsonMode ? "Form View" : "JSON View"}
          </button>
        </div>
      </div>

       {isJsonMode && (
        <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
          <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex-none">
                <h3 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
                Project JSON Data
                </h3>
                <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                Edit the raw JSON data for this project. Format is standard JSON.
                </p>
            </div>
            <div className="min-h-0 flex-1 w-full rounded-md border border-gray-300 bg-[#272822] dark:border-gray-700">
                  <JsonViewer
                      value={jsonValue}
                      onChange={setJsonValue}
                  />
            </div>
            {jsonError && (
              <div className="mt-2 flex-none rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {jsonError}
              </div>
            )}
            <div className="mt-4 flex flex-none justify-end gap-3">
              <button
                onClick={() => setIsJsonMode(false)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleJsonApply}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {!isJsonMode && (
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
              Subject Information
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Address
                </label>
                <input
                  type="text"
                  value={selectedProject.subject.info.address}
                  onChange={(event) =>
                    handleSubjectChange("address", event.target.value)
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="123 Main St, Odessa, TX 79761"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="Display name for subject..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="Legal description..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Acres
                </label>
                <input
                  type="text"
                  value={selectedProject.subject.info.acres ?? ""}
                  onChange={(event) =>
                    handleSubjectChange("acres", event.target.value)
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="9.834"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="1a2b3c4d5e6f7g8h9i0j"
                />
                {selectedProject.subjectPhotosFolderId && (
                  <Link
                    href={`/project/${projectId}/subject/photos?folderId=${encodeURIComponent(selectedProject.subjectPhotosFolderId)}${selectedProject.projectFolderId ? `&projectFolderId=${encodeURIComponent(selectedProject.projectFolderId)}` : ""}`}
                    className="mt-2 inline-block rounded-md border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
                  >
                    View Photos
                  </Link>
                )}
              </div>
               <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    placeholder="Winkler County Hospital District"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    placeholder="Lorenzo Serrano"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    placeholder="Commercial Office Building"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    placeholder="Project folder ID"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                    Used to fetch cover page data
                  </p>
                </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Comparable Properties
              </h3>
            </div>

            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              Each comparable type maintains its own markers, shapes, and map
              settings.
            </p>

            <div className="space-y-6">
              {COMPARABLE_TYPES.map((type) => {
                const list = comparablesByType[type];
                const sectionSlug = type === "Land" ? "land-sales" : type === "Sales" ? "sales" : "rentals";
                
                return (
                  <div
                    key={type}
                    className="rounded-md border border-gray-200 bg-gray-50 p-4 shadow-inner dark:border-gray-800 dark:bg-gray-950/50"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {type} Comparables ({list.length})
                      </span>
                      <div className="flex gap-2">
                          <Link
                            href={`/project/${projectId}/${sectionSlug}/comparables`}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                           Edit {type} Comps
                          </Link>
                      </div>
                    </div>

                    {list.length === 0 ? (
                      <div className="rounded-md border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                        No {type.toLowerCase()} comparables yet.
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                        {list.map((comparable, index) => (
                          <div
                            key={comparable.id}
                            className="flex flex-col rounded-md border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                          >
                            <div className="mb-3 flex items-start justify-between">
                              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {type} #{index + 1}
                              </span>
                              <div className="flex items-center gap-2">
                                {type === "Land" && (
                                  <Link
                                    href={`/project/${projectId}/land-sales/comps/${comparable.id}/location-map`}
                                    className="rounded border border-green-600 bg-green-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700 transition hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/40"
                                  >
                                    Map
                                  </Link>
                                )}
                              </div>
                            </div>

                            <div className="flex-1 space-y-3">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {comparable.address || "No Address"}
                                </div>
                                {comparable.addressForDisplay && comparable.addressForDisplay !== comparable.address && (
                                   <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                                    Display: {comparable.addressForDisplay}
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-2 dark:border-gray-700">
                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-gray-400 border-gray-400">APN</label>
                                    <div className="text-xs text-gray-700 font-mono dark:text-gray-300">
                                        {comparable.apn && comparable.apn.length > 0 
                                            ? comparable.apn.join(", ") 
                                            : <span className="text-gray-300 dark:text-gray-600">-</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-gray-400">Distance</label>
                                     <div className="text-xs text-gray-700 dark:text-gray-300">
                                        {comparable.distance ?? <span className="text-gray-300 dark:text-gray-600">-</span>}
                                    </div>
                                </div>
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
