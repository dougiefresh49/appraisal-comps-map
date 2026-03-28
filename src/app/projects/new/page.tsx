"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  normalizeProjectData,
  createDefaultProject,
} from "~/utils/projectStore";
import type {
  ProjectData,
  Comparable,
  ComparableType,
} from "~/utils/projectStore";
import { env } from "~/env";
import { useProjectsList, type DriveProject } from "~/hooks/useProjectsList";
import { insertProject } from "~/lib/supabase-queries";

interface CompData {
  Address?: string;
  APN?: string;
  Recording?: string;
  "#": number;
  [key: string]: unknown;
}

interface ProjectDataResponse {
  subjectPhotoBase64: string;
  subjectPhotosFolderId: string;
  propertyType: string;
  address: string;
  addressLabel: string;
  legalDescription: string;
  acres: string;
  clientName: string;
  clientCompany: string;
  landComps: CompData[];
  saleComps: CompData[];
  rentalComps: CompData[];
}

export default function NewProjectPage() {
  const router = useRouter();
  const {
    projects: availableProjects,
    isLoading: isLoadingList,
    error: listError,
  } = useProjectsList();

  const [projectName, setProjectName] = useState("");
  const [projectFolderId, setProjectFolderId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<DriveProject | null>(
    null,
  );

  const filteredProjects = availableProjects.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSelectProject = (project: DriveProject) => {
    setSelectedProject(project);
    setProjectFolderId(project.id);
    setProjectName(project.name);
    setSearchTerm("");
  };

  const handleClearSelection = () => {
    setSelectedProject(null);
    setProjectFolderId("");
    setProjectName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!projectName.trim()) {
      setError("Project name is required");
      return;
    }

    if (!projectFolderId.trim()) {
      setError("Project Folder ID is required");
      return;
    }

    setIsLoading(true);

    try {
      // Try local API route first, fallback to N8N webhook
      let response;
      try {
        response = await fetch("/api/project-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectFolderId: projectFolderId.trim(),
            include: { subjectPhoto: false },
          }),
        });
      } catch (localErr) {
        // Fallback to N8N webhook
        response = await fetch(
          env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL + "/project-data",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectFolderId: projectFolderId.trim(),
              include: { subjectPhoto: false },
            }),
          },
        );
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch project data: ${response.statusText}`);
      }

      const projectData = (await response.json()) as ProjectDataResponse;
      if (!projectData) {
        throw new Error("No project data returned from webhook");
      }

      const defaultProject = createDefaultProject();

      const convertCompsToComparables = (
        comps: CompData[],
        compType: ComparableType,
      ): Comparable[] => {
        return comps.map((comp, index) => {
          const apnArray =
            comp.APN && typeof comp.APN === "string"
              ? comp.APN.split("\n").filter((apn) => apn.trim().length > 0)
              : undefined;
          return {
            id: `comp-${compType.toLowerCase()}-${Date.now()}-${index}-${Math.random()}`,
            type: compType,
            address: comp.Address ?? "",
            addressForDisplay: comp.Address ?? "",
            apn: apnArray && apnArray.length > 0 ? apnArray : undefined,
            instrumentNumber:
              comp.Recording && typeof comp.Recording === "string"
                ? comp.Recording
                : undefined,
          };
        });
      };

      const newProject: ProjectData = {
        ...defaultProject,
        subject: {
          address: projectData.address || "",
          addressForDisplay:
            projectData.addressLabel || projectData.address || "",
          legalDescription: projectData.legalDescription || "",
          acres: projectData.acres || "",
        },
        comparables: [
          ...convertCompsToComparables(projectData.landComps || [], "Land"),
          ...convertCompsToComparables(projectData.saleComps || [], "Sales"),
          ...convertCompsToComparables(
            projectData.rentalComps || [],
            "Rentals",
          ),
        ],
        projectFolderId: projectFolderId.trim(),
        subjectPhotosFolderId: projectData.subjectPhotosFolderId || undefined,
        propertyType: projectData.propertyType || undefined,
        clientName: projectData.clientName || undefined,
        clientCompany: projectData.clientCompany || undefined,
      };

      const normalizedProject = normalizeProjectData(newProject);

      const newId = await insertProject(projectName.trim(), normalizedProject);

      router.push(`/project/${newId}`);
    } catch (error) {
      console.error("Error creating project:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to create project. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8 dark:bg-gray-900">
      <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-800">
        <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
          Create New Project
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!selectedProject ? (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                Select a Project Folder
              </label>

              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />

              <div className="max-h-60 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
                {isLoadingList ? (
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading available projects...
                  </div>
                ) : listError ? (
                  <div className="p-4 text-center text-sm text-red-500 dark:text-red-400">
                    Error: {listError}
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No projects found
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => handleSelectProject(project)}
                        className="w-full px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50"
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-900/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Selected Folder
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {selectedProject.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Change
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="projectName"
                  className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Project Name
                </label>
                <input
                  id="projectName"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
                  required
                  disabled={isLoading}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  You can rename the project for the app (this won&apos;t change
                  the folder name in Drive).
                </p>
              </div>

              <div className="hidden">
                <input
                  type="text"
                  value={projectFolderId}
                  readOnly
                  aria-hidden="true"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/projects")}
              className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 dark:border-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
              disabled={isLoading || !selectedProject}
            >
              {isLoading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
