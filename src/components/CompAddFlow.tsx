"use client";

import { useState, useEffect } from "react";
import type { ComparableType } from "~/utils/projectStore";
import type { CompType } from "~/types/comp-data";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface CompAddFlowProps {
  projectId: string;
  compId: string;
  compType: ComparableType;
  projectFolderId?: string;
  onComplete: () => void;
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

function typeToFolderName(type: ComparableType): string {
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
  compId,
  compType,
  projectFolderId,
  onComplete,
  onClose,
}: CompAddFlowProps) {
  const [step, setStep] = useState<Step>("select-folder");
  const [folders, setFolders] = useState<{ folderId: string; name: string }[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [extraContext, setExtraContext] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedCount, setParsedCount] = useState(0);

  const folderType = typeToFolderName(compType);

  // Load folders from Drive
  useEffect(() => {
    if (!projectFolderId) return;

    setIsLoading(true);
    void fetch("/api/comps-folder-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectFolderId, type: folderType }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load folders");
        const data = (await res.json()) as {
          folders: { folderId: string; name: string }[];
        };
        setFolders(data.folders ?? []);
      })
      .catch((err: unknown) => {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load Drive folders",
        );
        setStep("error");
      })
      .finally(() => setIsLoading(false));
  }, [projectFolderId, folderType]);

  const handleSelectFolder = async (folderId: string) => {
    setIsLoading(true);

    try {
      const res = await fetch("/api/comps-folder-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });

      if (!res.ok) throw new Error("Failed to load folder contents");
      const data = (await res.json()) as { files: DriveFile[] };
      setFiles(data.files ?? []);
      setStep("select-files");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load folder files",
      );
      setStep("error");
    } finally {
      setIsLoading(false);
    }
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

  const handleParse = async () => {
    if (selectedFileIds.size === 0) return;

    setStep("parsing");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/comps/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compId,
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
      setStep("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Parsing failed",
      );
      setStep("error");
    }
  };

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
            Parse Comp Files
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
                Select a Drive folder for this {compType.toLowerCase()} comp.
              </p>
              {isLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  Loading Drive folders…
                </div>
              ) : folders.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {projectFolderId
                    ? `No ${folderType} comp folders found in Drive.`
                    : "Project folder ID not set. Configure it on the project dashboard."}
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {folders.map((folder) => (
                    <button
                      key={folder.folderId}
                      onClick={() => void handleSelectFolder(folder.folderId)}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <span className="text-base">📁</span>
                      {folder.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "select-files" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select files to extract comp data from.
              </p>
              {files.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800">
                  No files found in this folder.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
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

              {/* Extra context */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Extra Context (optional)
                </label>
                <textarea
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  placeholder="Any additional details to help with extraction…"
                  rows={2}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("select-folder")}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Back
                </button>
                <button
                  onClick={() => void handleParse()}
                  disabled={selectedFileIds.size === 0}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Parse {selectedFileIds.size} File{selectedFileIds.size !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {step === "parsing" && (
            <div className="py-12 text-center space-y-3">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Extracting comp data with AI…
              </p>
              <p className="text-xs text-gray-400">
                This may take 15–30 seconds.
              </p>
            </div>
          )}

          {step === "done" && (
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl dark:bg-green-900/30">
                ✓
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Successfully parsed {parsedCount} file
                {parsedCount !== 1 ? "s" : ""}!
              </p>
              <button
                onClick={() => {
                  onComplete();
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
              <button
                onClick={onClose}
                className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
