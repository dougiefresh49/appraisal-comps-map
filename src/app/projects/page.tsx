"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createDefaultProject,
  normalizeProjectData,
  normalizeProjectsMap,
  getNextProjectName,
  PROJECTS_STORAGE_KEY,
  CURRENT_PROJECT_STORAGE_KEY,
  COMPARABLE_TYPES,
} from "~/utils/projectStore";
import type {
  ComparableInfo,
  ProjectData,
  ProjectsMap,
  SubjectInfo,
  ComparableType,
  LocationMapState,
  ComparablesMapState,
} from "~/utils/projectStore";

type EditableSubjectFields = keyof SubjectInfo;

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectsMap>({});
  const [selectedProjectName, setSelectedProjectName] = useState<string>("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const projectNames = useMemo(
    () => Object.keys(projects).sort((a, b) => a.localeCompare(b)),
    [projects],
  );

  const selectedProject = useMemo(() => {
    if (!selectedProjectName) return undefined;
    const data = projects[selectedProjectName];
    if (!data) return undefined;
    return normalizeProjectData(data);
  }, [projects, selectedProjectName]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
      let initialProjects: ProjectsMap = {};
      if (stored) {
        const parsed = JSON.parse(stored) as Record<
          string,
          Partial<ProjectData>
        >;
        initialProjects = normalizeProjectsMap(parsed);
      }
      const storedCurrent = window.localStorage.getItem(
        CURRENT_PROJECT_STORAGE_KEY,
      );
      let initialName =
        storedCurrent && initialProjects[storedCurrent] ? storedCurrent : "";
      if (!initialName) {
        const names = Object.keys(initialProjects);
        if (names.length > 0) {
          initialName = names[0]!;
        }
      }
      setProjects(initialProjects);
      setSelectedProjectName(initialName);
      setIsHydrated(true);
    } catch (error) {
      console.error("Failed to load projects", error);
      setProjects({});
      setSelectedProjectName("");
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projects),
      );
      if (selectedProjectName) {
        window.localStorage.setItem(
          CURRENT_PROJECT_STORAGE_KEY,
          selectedProjectName,
        );
      }
    } catch (error) {
      console.error("Failed to persist projects", error);
    }
  }, [isHydrated, projects, selectedProjectName]);

  useEffect(() => {
    if (!isJsonMode) return;
    if (!selectedProject) {
      setJsonValue("");
      return;
    }
    setJsonValue(JSON.stringify(selectedProject, null, 2));
    setJsonError(null);
  }, [isJsonMode, selectedProject]);

  const ensureProjectSelected = useCallback(() => {
    if (selectedProjectName || projectNames.length === 0) return;
    setSelectedProjectName(projectNames[0]!);
  }, [projectNames, selectedProjectName]);

  useEffect(() => {
    ensureProjectSelected();
  }, [ensureProjectSelected]);

  const handleSelectProject = (name: string) => {
    setSelectedProjectName(name);
  };

  const handleCreateProject = () => {
    router.push("/projects/new");
  };

  const handleRenameProject = () => {
    if (!selectedProjectName) return;
    if (typeof window === "undefined") return;
    const input = window.prompt("Rename project", selectedProjectName)?.trim();
    if (!input || input === selectedProjectName) return;
    if (projects[input]) {
      window.alert(
        "A project with that name already exists. Choose another name.",
      );
      return;
    }
    setProjects((prev) => {
      const current = prev[selectedProjectName];
      if (!current) return prev;
      const { [selectedProjectName]: _removed, ...rest } = prev;
      return {
        ...rest,
        [input]: current,
      };
    });
    setSelectedProjectName(input);
  };

  const handleDeleteProject = () => {
    if (!selectedProjectName) return;
    if (typeof window === "undefined") return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${selectedProjectName}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    // Get remaining project names before deletion
    const remainingNames = Object.keys(projects).filter(
      (name) => name !== selectedProjectName,
    );

    setProjects((prev) => {
      const { [selectedProjectName]: _removed, ...rest } = prev;
      return rest;
    });

    // Select another project if available
    if (remainingNames.length > 0) {
      setSelectedProjectName(remainingNames[0]!);
    } else {
      setSelectedProjectName("");
    }
  };

  const updateProject = useCallback(
    (updater: (project: ProjectData) => ProjectData) => {
      if (!selectedProjectName) return;
      setProjects((prev) => {
        const project = prev[selectedProjectName];
        if (!project) return prev;
        const normalized = normalizeProjectData(project);
        const updated = updater(normalized);
        return {
          ...prev,
          [selectedProjectName]: updated,
        };
      });
    },
    [selectedProjectName],
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
            // subjectInfo removed - use project.subject.info instead
          };
          return acc;
        },
        {} as Record<ComparableType, ComparablesMapState>,
      );

      return {
        subject: {
          ...project.subject,
          info: updatedInfo,
        },
        comparables: {
          ...project.comparables,
          byType: updatedByType,
        },
        location: {
          ...project.location,
          propertyInfo: { ...project.location.propertyInfo, ...updatedInfo },
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
    if (!selectedProjectName) return;
    try {
      const parsed = JSON.parse(jsonValue) as Partial<ProjectData>;
      const normalized = normalizeProjectData(parsed);
      setProjects((prev) => ({
        ...prev,
        [selectedProjectName]: normalized,
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
    updateProject((project) => ({
      ...project,
      comparables: {
        ...project.comparables,
        activeType: type,
      },
    }));
  };

  const isSubjectDisabled = !selectedProject;
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
  const activeMapType = selectedProject?.comparables.activeType ?? "Land";

  return (
    <div className="flex h-screen w-full bg-gray-50">
      <aside className="w-72 border-r border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Projects</h1>
          <button
            onClick={handleCreateProject}
            className="rounded-md border border-blue-500 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
          >
            + New
          </button>
        </div>
        <nav className="space-y-2">
          {projectNames.map((name) => {
            const isSelected = name === selectedProjectName;
            const project = projects[name];
            const normalizedProject = project
              ? normalizeProjectData(project)
              : null;
            return (
              <div key={name} className="space-y-1">
                <button
                  onClick={() => handleSelectProject(name)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-transparent bg-gray-100 text-gray-700 hover:border-gray-300 hover:bg-white"
                  }`}
                >
                  {name}
                </button>
                {isSelected && normalizedProject && (
                  <div className="ml-4 space-y-1 border-l-2 border-blue-200 pl-3">
                    <Link
                      href={`/cover?project=${encodeURIComponent(name)}`}
                      className="block rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                    >
                      Cover Page
                    </Link>
                    <Link
                      href="/location-map"
                      className="block rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                    >
                      Location Map
                    </Link>
                    <Link
                      href="/comps-map"
                      className="block rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                    >
                      Comparables Map
                    </Link>
                    {normalizedProject.subjectPhotosFolderId && (
                      <Link
                        href={`/photos?folderId=${encodeURIComponent(normalizedProject.subjectPhotosFolderId)}`}
                        className="block rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                      >
                        Photos
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {selectedProjectName || "Select a project"}
            </h2>
            <p className="text-sm text-gray-500">
              Manage subject details and comparable properties for each project.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsJsonMode((prev) => !prev)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              {isJsonMode ? "Form View" : "JSON View"}
            </button>
            <button
              onClick={handleRenameProject}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              disabled={!selectedProjectName}
            >
              Rename
            </button>
            <button
              onClick={handleDeleteProject}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
              disabled={!selectedProjectName}
            >
              Delete
            </button>
          </div>
        </div>

        {!selectedProject && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
            <p className="mb-4 text-gray-500">
              {projectNames.length === 0
                ? "No projects yet. Create your first project to get started."
                : "Select a project to view or edit its details."}
            </p>
            {projectNames.length === 0 && (
              <button
                onClick={handleCreateProject}
                className="rounded-md border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Create New Project
              </button>
            )}
          </div>
        )}

        {selectedProject && !isJsonMode && (
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
                    disabled={isSubjectDisabled}
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
                    disabled={isSubjectDisabled}
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
                    disabled={isSubjectDisabled}
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
                    disabled={isSubjectDisabled}
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
                    disabled={isSubjectDisabled}
                    placeholder="1a2b3c4d5e6f7g8h9i0j"
                  />
                  {selectedProject.subjectPhotosFolderId && (
                    <Link
                      href={`/photos?folderId=${encodeURIComponent(selectedProject.subjectPhotosFolderId)}`}
                      className="mt-2 inline-block rounded-md border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                    >
                      View Photos
                    </Link>
                  )}
                </div>
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
                    disabled={isSubjectDisabled}
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
                    disabled={isSubjectDisabled}
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
                    disabled={isSubjectDisabled}
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
                    disabled={isSubjectDisabled}
                    placeholder="Project folder ID for cover data"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Used to fetch cover page data from webhook
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
                                  {type === "Land" && selectedProjectName && (
                                    <Link
                                      href={`/land-comp-map?project=${encodeURIComponent(selectedProjectName)}&compId=${comparable.id}`}
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
                                    placeholder="Display name..."
                                  />
                                </div>
                              </div>
                              {(comparable.apn && comparable.apn.length > 0) ||
                              comparable.instrumentNumber ? (
                                <div className="mt-3 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                                  {comparable.apn &&
                                    comparable.apn.length > 0 && (
                                      <div>
                                        <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                                          APN
                                        </label>
                                        <div className="space-y-1">
                                          {comparable.apn.map((apn, idx) => (
                                            <div
                                              key={idx}
                                              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                                            >
                                              {apn}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  {comparable.instrumentNumber && (
                                    <div>
                                      <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                                        Recording
                                      </label>
                                      <div className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
                                        {comparable.instrumentNumber}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : null}
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

        {selectedProject && isJsonMode && (
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Project JSON
              </h3>
              <button
                onClick={handleJsonApply}
                className="rounded-md border border-green-600 bg-green-50 px-3 py-1 text-sm font-medium text-green-700 transition hover:bg-green-100"
              >
                Apply Changes
              </button>
            </div>
            <textarea
              value={jsonValue}
              onChange={(event) => setJsonValue(event.target.value)}
              className="h-96 w-full rounded-md border border-gray-300 bg-gray-900 p-4 font-mono text-sm text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {jsonError && (
              <p className="mt-2 text-sm text-red-600">
                Failed to parse JSON: {jsonError}
              </p>
            )}
            {!jsonError && (
              <p className="mt-2 text-xs text-gray-500">
                Tip: This JSON represents the full <code>ProjectData</code>{" "}
                object. Ensure the structure matches the expected schema before
                applying changes.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
