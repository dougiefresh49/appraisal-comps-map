"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  normalizeProjectData,
  normalizeProjectsMap,
  PROJECTS_STORAGE_KEY,
  CURRENT_PROJECT_STORAGE_KEY,
  createDefaultProject,
} from "~/utils/projectStore";
import type {
  ProjectData,
  ProjectsMap,
  ComparableInfo,
  ComparableType,
} from "~/utils/projectStore";
import { env } from "~/env";

interface CompData {
  Address?: string;
  APN?: string;
  Recording?: string;
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
  const [projectName, setProjectName] = useState("");
  const [projectFolderId, setProjectFolderId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Fetch project data from webhook
      const response = await fetch(
        env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL + "/project-data",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectFolderId: projectFolderId.trim(),
            include: {
              subjectPhoto: false,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch project data: ${response.statusText}`);
      }

      const projectData = (await response.json()) as ProjectDataResponse;
      if (!projectData) {
        throw new Error("No project data returned from webhook");
      }

      // Load existing projects
      let projects: ProjectsMap = {};
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as Record<
              string,
              Partial<ProjectData>
            >;
            projects = normalizeProjectsMap(parsed);
          } catch (error) {
            console.error("Failed to parse stored projects", error);
          }
        }
      }

      // Check if project name already exists
      if (projects[projectName.trim()]) {
        setError("A project with that name already exists");
        setIsLoading(false);
        return;
      }

      // Helper function to convert comp data to ComparableInfo
      const convertCompsToComparables = (
        comps: CompData[],
        type: ComparableType,
      ): ComparableInfo[] => {
        return comps.map((comp, index) => {
          // Parse APN: split by newlines and filter out empty strings
          const apnArray =
            comp.APN && typeof comp.APN === "string"
              ? comp.APN.split("\n").filter((apn) => apn.trim().length > 0)
              : undefined;

          return {
            id: `comp-${type.toLowerCase()}-${Date.now()}-${index}-${Math.random()}`,
            address: comp.Address ?? "",
            addressForDisplay: comp.Address ?? "",
            isTailPinned: true,
            type,
            apn: apnArray && apnArray.length > 0 ? apnArray : undefined,
            instrumentNumber:
              comp.Recording && typeof comp.Recording === "string"
                ? comp.Recording
                : undefined,
          };
        });
      };

      // Create new project from webhook data
      const defaultProject = createDefaultProject();

      // Convert comps from webhook to ComparableInfo arrays
      const landComparables = convertCompsToComparables(
        projectData.landComps || [],
        "Land",
      );
      const saleComparables = convertCompsToComparables(
        projectData.saleComps || [],
        "Sales",
      );
      const rentalComparables = convertCompsToComparables(
        projectData.rentalComps || [],
        "Rentals",
      );

      const newProject: ProjectData = {
        ...defaultProject,
        subject: {
          ...defaultProject.subject,
          info: {
            address: projectData.address || "",
            addressForDisplay:
              projectData.addressLabel || projectData.address || "",
            legalDescription: projectData.legalDescription || "",
            acres: projectData.acres || "",
          },
        },
        location: {
          ...defaultProject.location,
          propertyInfo: {
            address: projectData.address || "",
            addressForDisplay:
              projectData.addressLabel || projectData.address || "",
            legalDescription: projectData.legalDescription || "",
            acres: projectData.acres || "",
          },
        },
        comparables: {
          ...defaultProject.comparables,
          byType: {
            Land: {
              ...defaultProject.comparables.byType.Land,
              comparables: [
                ...(defaultProject.comparables.byType.Land.comparables ?? []),
                ...landComparables,
              ],
            },
            Sales: {
              ...defaultProject.comparables.byType.Sales,
              comparables: [
                ...(defaultProject.comparables.byType.Sales.comparables ?? []),
                ...saleComparables,
              ],
            },
            Rentals: {
              ...defaultProject.comparables.byType.Rentals,
              comparables: [
                ...(defaultProject.comparables.byType.Rentals.comparables ??
                  []),
                ...rentalComparables,
              ],
            },
          },
        },
        projectFolderId: projectFolderId.trim(),
        subjectPhotosFolderId: projectData.subjectPhotosFolderId || undefined,
        propertyType: projectData.propertyType || undefined,
        clientName: projectData.clientName || undefined,
        clientCompany: projectData.clientCompany || undefined,
      };

      // Normalize the project data
      const normalizedProject = normalizeProjectData(newProject);

      // Save to localStorage
      projects[projectName.trim()] = normalizedProject;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          PROJECTS_STORAGE_KEY,
          JSON.stringify(projects),
        );
        window.localStorage.setItem(
          CURRENT_PROJECT_STORAGE_KEY,
          projectName.trim(),
        );
      }

      // Navigate to projects page
      router.push("/projects");
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          Create New Project
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="projectName"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              Project Name
            </label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="Project 1"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label
              htmlFor="projectFolderId"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              Project Folder ID
            </label>
            <input
              id="projectFolderId"
              type="text"
              value={projectFolderId}
              onChange={(e) => setProjectFolderId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="1N5_7ynYjf9CqgEqHHgOcLRB55o7uWJqz"
              required
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Google Drive folder ID for the project
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/projects")}
              className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
