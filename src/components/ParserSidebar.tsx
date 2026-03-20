"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface ParserSidebarProps {
  projectId: string;
  type: string;
}

interface CompFolder {
  folderId: string;
  name: string;
  isParsed: boolean;
}

interface FolderListResponse {
  folders: CompFolder[];
}

import { useProject } from "~/hooks/useProject";

export function ParserSidebar({ projectId, type }: ParserSidebarProps) {
  const searchParams = useSearchParams();
  const currentFolderId = searchParams.get("folderId");
  const [folders, setFolders] = useState<CompFolder[]>([]);
  const [isFetchingFolders, setIsFetchingFolders] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { project, isLoading: isProjectLoading } = useProject(projectId);
  const projectFolderId = project?.projectFolderId;

  // Fetch folders function
  const fetchFolders = async () => {
    if (!projectFolderId) return;
    
    setIsFetchingFolders(true);
    setError(null);
    try {
      const response = await fetch("/api/comps-folder-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectFolderId, type }),
      });

      if (!response.ok) throw new Error("Failed to fetch folders");

      const data = (await response.json()) as FolderListResponse;
      setFolders(data.folders ?? []);
    } catch (err) {
      console.error(err);
      setError("Failed to load folders");
    } finally {
      setIsFetchingFolders(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (!isProjectLoading && projectFolderId) {
        void fetchFolders();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFolderId, type, isProjectLoading]);

  const isLoading = isProjectLoading || isFetchingFolders;

  return (
    <aside className="w-64 border-r border-gray-200 bg-white p-6 shadow-sm overflow-y-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
            <h1 className="text-lg font-semibold text-gray-900 capitalize">
            {type} Parser
            </h1>
            <p className="text-xs text-gray-500">
            Select a folder to parse or view content.
            </p>
        </div>
        <button
            onClick={() => void fetchFolders()}
            disabled={isLoading}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            title="Refresh folders"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 animate-pulse">Loading folders...</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : (
        <nav className="space-y-1">
          {folders.map((folder) => {
            const isActive = currentFolderId === folder.folderId;
            return (
              <Link
                key={folder.folderId}
                href={`/project/${projectId}/parser/${type}?folderId=${folder.folderId}`}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <div className="truncate" title={folder.name}>
                    {folder.name}
                </div>
                {folder.isParsed && (
                    <span className="ml-auto inline-block h-2 w-2 rounded-full bg-green-400" title="Parsed"></span>
                )}
              </Link>
            );
          })}
          {folders.length === 0 && (
            <div className="text-sm text-gray-500 italic">No folders found.</div>
          )}
        </nav>
      )}
    </aside>
  );
}
