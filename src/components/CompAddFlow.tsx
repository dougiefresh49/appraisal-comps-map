"use client";

import { useState, useEffect, useCallback } from "react";
import { upsertComparable } from "~/lib/supabase-queries";
import type { ComparableType, Comparable } from "~/utils/projectStore";
import type { CompType } from "~/types/comp-data";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface FolderEntry {
  folderId: string;
  name: string;
}

export interface CompAddFlowProps {
  projectId: string;
  compType: ComparableType;
  /** If provided, comp already exists (parse-only mode). Otherwise a new comp is created. */
  compId?: string;
  /** Direct type-specific folder ID from `folder_structure.compsFolderIds.{type}`. */
  compsFolderId?: string;
  /** Fallback project root folder ID for folder hierarchy traversal. */
  projectFolderId?: string;
  /** Folder IDs already claimed by existing comps — shown as "already added". */
  existingFolderIds?: string[];
  /** If provided, skip folder selection and load files from this folder. */
  initialFolderId?: string;
  /** Called when the flow finishes successfully. Receives the comp ID. */
  onComplete: (compId: string) => void;
  onClose: () => void;
}

function typeToApiType(type: ComparableType): CompType {
  switch (type) {
    case "Land":
      return "land";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
  }
}

type Step = "select-folder" | "select-files" | "parsing" | "done" | "error";

export function CompAddFlow({
  projectId,
  compType,
  compId,
  compsFolderId,
  projectFolderId,
  existingFolderIds,
  initialFolderId,
  onComplete,
  onClose,
}: CompAddFlowProps) {
  const isAddMode = !compId;
  const existingSet = new Set(existingFolderIds ?? []);

  const [step, setStep] = useState<Step>(
    initialFolderId ? "select-files" : "select-folder",
  );
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    initialFolderId ?? null,
  );
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(
    null,
  );
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [extraContext, setExtraContext] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedCount, setParsedCount] = useState(0);
  const [resultCompId, setResultCompId] = useState<string | null>(
    compId ?? null,
  );

  const loadFolders = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (compsFolderId) {
        const res = await fetch("/api/drive/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: compsFolderId, foldersOnly: true }),
        });
        if (!res.ok) throw new Error("Failed to load Drive folders");
        const data = (await res.json()) as {
          files: { id: string; name: string; mimeType: string }[];
        };
        setFolders(
          (data.files ?? []).map((f) => ({ folderId: f.id, name: f.name })),
        );
      } else if (projectFolderId) {
        const res = await fetch("/api/comps-folder-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectFolderId,
            type: typeToApiType(compType),
          }),
        });
        if (!res.ok) throw new Error("Failed to load Drive folders");
        const data = (await res.json()) as { folders: FolderEntry[] };
        setFolders(data.folders ?? []);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load Drive folders",
      );
      setStep("error");
    } finally {
      setIsLoading(false);
    }
  }, [compsFolderId, projectFolderId, compType]);

  useEffect(() => {
    if (step === "select-folder") {
      void loadFolders();
    }
  }, [step, loadFolders]);

  const loadFiles = useCallback(async (folderId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/comps-folder-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) throw new Error("Failed to load folder contents");
      const data = (await res.json()) as {
        name: string;
        files: DriveFile[];
      };
      setFiles(data.files ?? []);
      setSelectedFolderName(data.name ?? null);
      setStep("select-files");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load folder files",
      );
      setStep("error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFolderId && step === "select-files" && files.length === 0) {
      void loadFiles(initialFolderId);
    }
  }, [initialFolderId, step, files.length, loadFiles]);

  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    void loadFiles(folderId);
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const selectAllFiles = () => {
    setSelectedFileIds(new Set(files.map((f) => f.id)));
  };

  const handleParse = async () => {
    if (selectedFileIds.size === 0) return;

    setStep("parsing");
    setErrorMessage(null);

    let activeCompId = compId;

    try {
      if (isAddMode) {
        activeCompId = crypto.randomUUID();
        const newComp: Comparable = {
          id: activeCompId,
          type: compType,
          address: "",
          addressForDisplay: "",
          folderId: selectedFolderId ?? undefined,
          parsedDataStatus: "processing",
        };
        await upsertComparable(projectId, newComp);
      }

      const res = await fetch("/api/comps/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compId: activeCompId,
          projectId,
          type: typeToApiType(compType),
          fileIds: Array.from(selectedFileIds),
          extraContext: extraContext.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Parse failed");
      }

      setParsedCount(selectedFileIds.size);
      setResultCompId(activeCompId ?? null);
      setStep("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Parsing failed",
      );
      setStep("error");
    }
  };

  const hasFolderSource = !!(compsFolderId ?? projectFolderId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {isAddMode ? "Add Comparable" : "Parse Comp Files"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === "select-folder" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a Drive folder for this{" "}
                {compType.toLowerCase()} comp.
              </p>
              {isLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  Loading Drive folders…
                </div>
              ) : folders.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {hasFolderSource
                    ? `No ${compType.toLowerCase()} comp folders found in Drive.`
                    : "Project folder not configured. Set it on the project dashboard."}
                </div>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {folders.map((folder) => {
                    const isUsed = existingSet.has(folder.folderId);
                    return (
                      <button
                        key={folder.folderId}
                        onClick={() => {
                          if (!isUsed) handleSelectFolder(folder.folderId);
                        }}
                        disabled={isUsed}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium transition ${
                          isUsed
                            ? "cursor-not-allowed text-gray-500 opacity-50 dark:text-gray-600"
                            : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                        }`}
                      >
                        <span className="text-base">📁</span>
                        <span className="flex-1 truncate">{folder.name}</span>
                        {isUsed && (
                          <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                            Added
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === "select-files" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedFolderName
                    ? `Files in "${selectedFolderName}"`
                    : "Select files to extract comp data from."}
                </p>
                {files.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllFiles}
                    className="text-xs font-medium text-blue-500 hover:text-blue-400"
                  >
                    Select all
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  Loading files…
                </div>
              ) : files.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800">
                  No files found in this folder.
                </div>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {files.map((file) => (
                    <label
                      key={file.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFileIds.has(file.id)}
                        onChange={() => toggleFileSelection(file.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {file.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Extra Context (optional)
                </label>
                <textarea
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  placeholder="Any additional details to help with extraction…"
                  rows={2}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div className="flex gap-3">
                {!initialFolderId && (
                  <button
                    onClick={() => {
                      setStep("select-folder");
                      setFiles([]);
                      setSelectedFileIds(new Set());
                      setSelectedFolderId(null);
                      setSelectedFolderName(null);
                    }}
                    className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={() => void handleParse()}
                  disabled={selectedFileIds.size === 0}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Parse {selectedFileIds.size} File
                  {selectedFileIds.size !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {step === "parsing" && (
            <div className="space-y-3 py-12 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isAddMode
                  ? "Creating comp & extracting data with AI…"
                  : "Extracting comp data with AI…"}
              </p>
              <p className="text-xs text-gray-400">
                This may take 15–30 seconds.
              </p>
            </div>
          )}

          {step === "done" && (
            <div className="space-y-4 py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl dark:bg-green-900/30">
                ✓
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Successfully parsed {parsedCount} file
                {parsedCount !== 1 ? "s" : ""}!
              </p>
              <button
                onClick={() => {
                  if (resultCompId) onComplete(resultCompId);
                  onClose();
                }}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                View Comp Data
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-4 py-4">
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {errorMessage ?? "An error occurred"}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    setStep("select-folder");
                  }}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Retry
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
