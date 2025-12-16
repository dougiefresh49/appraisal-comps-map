"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ReportSectionContent } from "~/components/ReportSectionContent";
import { type ReportSection } from "~/server/reports/actions";
import {
  CURRENT_PROJECT_STORAGE_KEY,
  PROJECTS_STORAGE_KEY,
  normalizeProjectData,
  normalizeProjectsMap,
  type ProjectData,
} from "~/utils/projectStore";

interface ReportSectionPageProps {
  section: ReportSection;
  title: string;
  description?: string;
}

export function ReportSectionPage({
  section,
  title,
  description,
}: ReportSectionPageProps) {
  const searchParams = useSearchParams();
  const [projectFolderId, setProjectFolderId] = useState<string | undefined>(
    undefined,
  );
  const [projectName, setProjectName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
      if (!stored) {
        setError("No projects found. Create a project first.");
        return;
      }

      const raw = JSON.parse(stored) as Record<string, Partial<ProjectData>>;
      const projects = normalizeProjectsMap(raw);

      const requestedProject =
        searchParams.get("project") ??
        window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY) ??
        Object.keys(projects)[0];

      if (!requestedProject || !projects[requestedProject]) {
        setError("Select a project from the Projects page to continue.");
        return;
      }

      const normalized = normalizeProjectData(projects[requestedProject]);

      setProjectName(requestedProject);
      setProjectFolderId(normalized.projectFolderId ?? undefined);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load project data.";
      setError(message);
    }
  }, [searchParams]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {projectName ? (
            <>
              Project: <span className="font-semibold">{projectName}</span>
            </>
          ) : (
            "Project not selected"
          )}
        </div>
        {projectFolderId ? (
          <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">
            Folder ID linked
          </span>
        ) : (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">
            Folder ID missing
          </span>
        )}
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <ReportSectionContent
        projectFolderId={projectFolderId}
        section={section}
        title={title}
        description={description}
      />
    </div>
  );
}
