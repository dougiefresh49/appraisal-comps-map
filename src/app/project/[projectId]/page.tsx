"use client";

import { useState, use, useMemo } from "react";
import Link from "next/link";
import {
  normalizeProjectData,
  COMPARABLE_TYPES,
  getComparablesByType,
  type ProjectData,
  type ComparableType,
  type Comparable,
} from "~/utils/projectStore";
import { useProject } from "~/hooks/useProject";
import { useSubjectData } from "~/hooks/useSubjectData";

import { JsonViewer } from "~/components/JsonViewer";

interface ProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function ProjectDashboard({ params }: ProjectPageProps) {
  const { projectId } = use(params);
  const {
    project: selectedProject,
    updateProject,
    isLoading,
    projectExists,
    projectName,
  } = useProject(projectId);
  const { subjectData, isLoading: isSubjectLoading } = useSubjectData(projectId);
  const decodedProjectId = decodeURIComponent(projectId);
  const displayHeading = projectName?.trim()
    ? projectName
    : decodedProjectId;

  const subjectCore = useMemo(() => {
    if (!subjectData?.core || typeof subjectData.core !== "object") return null;
    return subjectData.core as Record<string, unknown>;
  }, [subjectData]);


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

  const handleJsonApply = () => {
    if (!selectedProject) return;
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
      return COMPARABLE_TYPES.reduce<Record<ComparableType, Comparable[]>>(
        (acc, type) => {
          acc[type] = [];
          return acc;
        },
        {} as Record<ComparableType, Comparable[]>,
      );
    }
    return COMPARABLE_TYPES.reduce<Record<ComparableType, Comparable[]>>(
      (acc, type) => {
        acc[type] = getComparablesByType(selectedProject, type);
        return acc;
      },
      {} as Record<ComparableType, Comparable[]>,
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
            {displayHeading}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Report Overview
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
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Subject Information
              </h3>
              <Link
                href={`/project/${projectId}/subject/overview`}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Edit in Subject Overview
              </Link>
            </div>

            {subjectCore && Object.keys(subjectCore).length > 0 ? (
              <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
                {(
                  [
                    ["Address", subjectCore.Address],
                    ["Legal Description", subjectCore.Legal],
                    ["APN", subjectCore.APN],
                    ["City", subjectCore.City],
                    ["State", subjectCore.State],
                    ["County", subjectCore.County],
                    ["Zoning", subjectCore.Zoning],
                    ["Year Built", subjectCore["Year Built"]],
                    ["Land Size (AC)", subjectCore["Land Size (AC)"]],
                    ["Land Size (SF)", subjectCore["Land Size (SF)"] ?? (typeof subjectCore["Land Size (AC)"] === "number" ? subjectCore["Land Size (AC)"] * 43560 : null)],
                    ["Building Size (SF)", subjectCore["Building Size (SF)"]],
                    ["Condition", subjectCore.Condition],
                    ["Construction", subjectCore.Construction],
                    ["Surface", subjectCore.Surface],
                  ] as [string, unknown][]
                )
                  .filter(([, v]) => v != null && v !== "" && v !== 0)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
              </div>
            ) : !isSubjectLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No subject data yet.{" "}
                <Link
                  href={`/project/${projectId}/subject/overview`}
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open Subject Overview
                </Link>{" "}
                to add property details, or process subject documents.
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
              Project Details
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
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
                  readOnly
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
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
                                        -
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
