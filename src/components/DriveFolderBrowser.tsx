"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FolderIcon,
  DocumentIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
}

interface BreadcrumbEntry {
  id: string;
  name: string;
}

interface DriveFolderBrowserProps {
  rootFolderId: string;
  rootFolderName?: string;
  onSelect?: (file: DriveFileItem) => void;
  onMultiSelect?: (files: DriveFileItem[]) => void;
  multiSelect?: boolean;
  filter?: "folders" | "files" | "all";
  className?: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

function fileIcon(mimeType: string) {
  if (mimeType === FOLDER_MIME) {
    return <FolderIcon className="h-4 w-4 text-blue-400" />;
  }
  if (mimeType.startsWith("image/")) {
    return <DocumentIcon className="h-4 w-4 text-emerald-400" />;
  }
  if (mimeType === "application/pdf") {
    return <DocumentIcon className="h-4 w-4 text-red-400" />;
  }
  return <DocumentIcon className="h-4 w-4 text-gray-400" />;
}

export function DriveFolderBrowser({
  rootFolderId,
  rootFolderName = "Project",
  onSelect,
  onMultiSelect,
  multiSelect = false,
  filter = "all",
  className = "",
}: DriveFolderBrowserProps) {
  const [currentFolderId, setCurrentFolderId] = useState(rootFolderId);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    { id: rootFolderId, name: rootFolderName },
  ]);
  const [items, setItems] = useState<DriveFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchFolder = useCallback(async (folderId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { folderId };
      if (filter === "folders") body.foldersOnly = true;
      if (filter === "files") body.filesOnly = true;

      const res = await fetch("/api/drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load folder");
      }

      const data = (await res.json()) as { files: DriveFileItem[] };
      const sorted = [...data.files].sort((a, b) => {
        const aIsFolder = a.mimeType === FOLDER_MIME ? 0 : 1;
        const bIsFolder = b.mimeType === FOLDER_MIME ? 0 : 1;
        if (aIsFolder !== bIsFolder) return aIsFolder - bIsFolder;
        return a.name.localeCompare(b.name);
      });
      setItems(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchFolder(currentFolderId);
  }, [currentFolderId, fetchFolder]);

  const navigateToFolder = useCallback(
    (folder: DriveFileItem) => {
      setCurrentFolderId(folder.id);
      setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
      setSelectedIds(new Set());
    },
    [],
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      const target = breadcrumbs[index];
      if (!target) return;
      setCurrentFolderId(target.id);
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      setSelectedIds(new Set());
    },
    [breadcrumbs],
  );

  const handleItemClick = useCallback(
    (item: DriveFileItem) => {
      if (item.mimeType === FOLDER_MIME) {
        navigateToFolder(item);
        return;
      }

      if (multiSelect) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);

          if (onMultiSelect) {
            const selected = items.filter((i) => next.has(i.id));
            onMultiSelect(selected);
          }
          return next;
        });
      } else {
        onSelect?.(item);
      }
    },
    [multiSelect, navigateToFolder, onSelect, onMultiSelect, items],
  );

  return (
    <div className={`rounded-lg border border-gray-700 bg-gray-900 ${className}`}>
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 border-b border-gray-800 px-3 py-2">
        {breadcrumbs.length > 1 && (
          <button
            type="button"
            onClick={() => navigateToBreadcrumb(breadcrumbs.length - 2)}
            className="mr-1 rounded p-1 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {breadcrumbs.map((crumb, i) => (
          <div key={crumb.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRightIcon className="h-3 w-3 text-gray-600" />}
            <button
              type="button"
              onClick={() => navigateToBreadcrumb(i)}
              className={`rounded px-1.5 py-0.5 text-xs transition ${
                i === breadcrumbs.length - 1
                  ? "font-medium text-gray-200"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* File list */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
          </div>
        ) : error ? (
          <div className="px-4 py-6 text-center text-xs text-red-400">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-gray-500">
            Empty folder
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {items.map((item) => {
              const isFolder = item.mimeType === FOLDER_MIME;
              const isSelected = selectedIds.has(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition ${
                    isSelected
                      ? "bg-blue-900/20 text-blue-300"
                      : "text-gray-300 hover:bg-gray-800/50"
                  }`}
                >
                  {multiSelect && !isFolder && (
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                        isSelected
                          ? "border-blue-500 bg-blue-600"
                          : "border-gray-600 bg-gray-800"
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}
                  {fileIcon(item.mimeType)}
                  <span className="flex-1 truncate">{item.name}</span>
                  {isFolder && (
                    <ChevronRightIcon className="h-3.5 w-3.5 text-gray-600" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
