"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { ReportSectionContent } from "~/components/ReportSectionContent";
import { type ReportSection } from "~/server/reports/actions";
import { useProject } from "~/hooks/useProject";

interface ReportSectionPageProps {
  section: ReportSection;
  title: string;
  description?: string;
  emptyStateNote?: ReactNode;
  /** Document IDs to exclude from AI generation context */
  excludedDocIds?: Set<string>;
  /** When true, photo analyses will be omitted from the AI generation prompt */
  excludePhotoContext?: boolean;
}

export function ReportSectionPage({
  section,
  title,
  description,
  emptyStateNote,
  excludedDocIds,
  excludePhotoContext,
}: ReportSectionPageProps) {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = routeParams.projectId ?? "";
  const { project, projectName, isLoading } = useProject(projectId);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!project) {
      setError("Select a project from the Projects page to continue.");
    } else {
      setError(null);
    }
  }, [project, isLoading]);

  const projectFolderId = project?.projectFolderId;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {projectName ? (
            <>
              Project:{" "}
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {projectName}
              </span>
            </>
          ) : (
            "Project not selected"
          )}
        </div>
        {projectFolderId ? (
          <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            Folder ID linked
          </span>
        ) : (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
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
        projectId={projectId}
        projectFolderId={projectFolderId}
        section={section}
        title={title}
        description={description}
        emptyStateNote={emptyStateNote}
        excludedDocIds={excludedDocIds}
        excludePhotoContext={excludePhotoContext}
      />
    </div>
  );
}
