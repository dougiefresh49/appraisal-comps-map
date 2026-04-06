"use client";

import { use, useCallback, useEffect, useState } from "react";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";

interface FolderStructure {
  costReportFolderId?: string;
  [key: string]: unknown;
}

interface DriveListFile {
  id: string;
  name: string;
  mimeType: string;
}

interface SubjectCostReportPageProps {
  params: Promise<{ projectId: string }>;
}

function isHtmlFile(f: DriveListFile): boolean {
  const n = f.name.toLowerCase();
  return (
    f.mimeType === "text/html" ||
    f.mimeType === "application/xhtml+xml" ||
    n.endsWith(".html") ||
    n.endsWith(".htm")
  );
}

export default function SubjectCostReportPage({ params }: SubjectCostReportPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);

  const { project, isLoading: projectLoading } = useProject(decodedProjectId);

  const [files, setFiles] = useState<DriveListFile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const raw = project as unknown as Record<string, unknown> | undefined;
  const folderStructure = (raw?.folderStructure ??
    raw?.folder_structure) as FolderStructure | undefined;
  const costReportFolderId = folderStructure?.costReportFolderId;

  const loadFiles = useCallback(async () => {
    if (!costReportFolderId) {
      setFiles([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: costReportFolderId,
          filesOnly: true,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { files: DriveListFile[] };
      setFiles(data.files ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load cost report folder");
      setFiles([]);
    } finally {
      setListLoading(false);
    }
  }, [costReportFolderId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const firstHtml = files.find(isHtmlFile);
  const previewSrc = firstHtml
    ? `https://drive.google.com/file/d/${firstHtml.id}/preview`
    : null;

  return (
    <div className="min-h-full bg-gray-950 p-6 text-gray-100 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Cost report</h1>
          <p className="mt-1 text-sm text-gray-400">
            HTML cost report from the reports/cost-report folder (Drive preview).
          </p>
        </div>

        {projectLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
          </div>
        ) : !costReportFolderId ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-16 text-center">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">
              No cost report folder is linked. Project setup should discover{" "}
              <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-300">
                reports/cost-report
              </code>
              .
            </p>
          </div>
        ) : listLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
          </div>
        ) : listError ? (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {listError}
          </div>
        ) : !previewSrc ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-16 text-center">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">
              No HTML file found in the cost report folder.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-inner">
            <p className="border-b border-gray-800 px-4 py-2 text-xs text-gray-500">
              {firstHtml?.name}
            </p>
            <iframe
              title="Cost report preview"
              src={previewSrc}
              className="h-[min(85vh,900px)] w-full bg-white"
              allow="autoplay"
            />
          </div>
        )}
      </div>
    </div>
  );
}
