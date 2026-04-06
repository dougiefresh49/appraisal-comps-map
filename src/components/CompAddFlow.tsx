"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "~/utils/supabase/client";
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

interface CompSearchResult {
  comp_id: string;
  comp_type: string;
  address: string;
  instrument_number: string | null;
  raw_data: Record<string, string>;
  projects_using: { project_id: string; project_name: string }[];
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
  /**
   * Called when the flow finishes successfully. Receives the comp ID and,
   * for cloned comps, the full Comparable so callers can update local state.
   */
  onComplete: (compId: string, newComp?: Comparable) => void;
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

function routeSlugForCompType(compType: ComparableType): string {
  switch (compType) {
    case "Land":
      return "land-sales";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
  }
}

type Step = "select-folder" | "select-files" | "parsing" | "done" | "error";
type ActiveTab = "drive" | "search";

// ─────────────────────────────────────────────────────────────────────────────
// Search Past Comps panel
// ─────────────────────────────────────────────────────────────────────────────

interface SearchPanelProps {
  projectId: string;
  compType: ComparableType;
  compsFolderId?: string;
  onCloneComplete: (compId: string, newComp: Comparable) => void;
}

function SearchPanel({ projectId, compType, compsFolderId, onCloneComplete }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSearched = useRef(false);

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      hasSearched.current = false;
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    hasSearched.current = true;

    try {
      const res = await fetch("/api/comps/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q.trim(),
          type: compType,
          limit: 30,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Search failed");
      }

      const data = (await res.json()) as { results: CompSearchResult[] };
      setResults(data.results ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [compType]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void performSearch(value);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleClone = async (result: CompSearchResult) => {
    setCloningId(result.comp_id);
    setCloneError(null);

    try {
      const res = await fetch("/api/comps/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCompId: result.comp_id,
          projectId,
          compType,
          compsFolderId,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Clone failed");
      }

      const data = (await res.json()) as {
        compId: string;
        address: string;
        addressForDisplay: string;
        apn?: string[];
        instrumentNumber?: string;
        folderId?: string;
      };

      const newComp: Comparable = {
        id: data.compId,
        type: compType,
        address: data.address,
        addressForDisplay: data.addressForDisplay,
        apn: data.apn,
        instrumentNumber: data.instrumentNumber,
        folderId: data.folderId,
        parsedDataStatus: "parsed",
      };

      onCloneComplete(data.compId, newComp);
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Clone failed");
      setCloningId(null);
    }
  };

  const noResults = hasSearched.current && !isSearching && results.length === 0 && !searchError;

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <svg
            className="h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by address or APN…"
          className="w-full rounded-md border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
        {isSearching && (
          <div className="absolute inset-y-0 right-3 flex items-center">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}
      </div>

      {/* Error */}
      {searchError && (
        <div className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-300">
          {searchError}
        </div>
      )}
      {cloneError && (
        <div className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-300">
          Clone failed: {cloneError}
        </div>
      )}

      {/* Results list */}
      <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
        {!hasSearched.current && !isSearching && (
          <div className="rounded-md border border-dashed border-gray-700 bg-gray-800/50 py-8 text-center">
            <p className="text-xs text-gray-500">
              Search by address or APN to find comps from past reports
            </p>
          </div>
        )}

        {noResults && (
          <div className="rounded-md border border-dashed border-gray-700 bg-gray-800/50 py-6 text-center">
            <p className="text-xs text-gray-500">No comps found matching &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {results.map((result) => {
          const salePrice = result.raw_data["Sale Price"] ?? result.raw_data["Rent / Month Start"] ?? null;
          const dateOfSale = result.raw_data["Date of Sale"] ?? result.raw_data["Lease Start"] ?? null;
          const isCloningThis = cloningId === result.comp_id;

          return (
            <div
              key={result.comp_id}
              className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 transition hover:border-gray-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  {/* Address */}
                  <p className="truncate text-sm font-medium text-gray-100">
                    {result.address || "—"}
                  </p>

                  {/* Key fields row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400">
                    {salePrice && (
                      <span>
                        <span className="text-gray-500">Price:</span>{" "}
                        <span className="text-gray-300">{salePrice}</span>
                      </span>
                    )}
                    {dateOfSale && (
                      <span>
                        <span className="text-gray-500">Date:</span>{" "}
                        <span className="text-gray-300">{dateOfSale}</span>
                      </span>
                    )}
                    <span>
                      <span className="inline-flex items-center rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
                        {result.comp_type}
                      </span>
                    </span>
                  </div>

                  {/* Used in */}
                  {result.projects_using.length > 0 && (
                    <p className="text-[11px] text-gray-500">
                      <span className="text-gray-600">Used in:</span>{" "}
                      {result.projects_using
                        .map((p) => p.project_name)
                        .join(", ")}
                    </p>
                  )}
                </div>

                {/* Clone button */}
                <button
                  type="button"
                  disabled={!!cloningId}
                  onClick={() => void handleClone(result)}
                  className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCloningThis ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                      Cloning…
                    </span>
                  ) : (
                    "Clone"
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main CompAddFlow component
// ─────────────────────────────────────────────────────────────────────────────

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
  const router = useRouter();
  const isAddMode = !compId;
  const existingSet = new Set(existingFolderIds ?? []);

  // In parse-only mode (compId provided), skip the tab UI and go straight to
  // the drive flow without showing the search tab.
  const showTabs = isAddMode;

  const [activeTab, setActiveTab] = useState<ActiveTab>("drive");
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
    if (activeTab === "drive" && step === "select-folder") {
      void loadFolders();
    }
  }, [activeTab, step, loadFolders]);

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

  const pendingCompIdRef = useRef<string | null>(null);

  const handleParse = async () => {
    if (selectedFileIds.size === 0) return;

    setStep("parsing");
    setErrorMessage(null);

    let activeCompId = compId ?? pendingCompIdRef.current;

    try {
      if (isAddMode && !activeCompId) {
        activeCompId = crypto.randomUUID();
        pendingCompIdRef.current = activeCompId;
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

      pendingCompIdRef.current = null;
      setParsedCount(selectedFileIds.size);
      setResultCompId(activeCompId ?? null);
      setStep("done");
    } catch (err) {
      if (isAddMode && activeCompId) {
        const supabase = createClient();
        void supabase.from("comparables").delete().eq("id", activeCompId);
        pendingCompIdRef.current = null;
      }
      setErrorMessage(
        err instanceof Error ? err.message : "Parsing failed",
      );
      setStep("error");
    }
  };

  const hasFolderSource = !!(compsFolderId ?? projectFolderId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-gray-900 shadow-2xl ring-1 ring-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-100">
            {isAddMode ? "Add Comparable" : "Parse Comp Files"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs — only shown in add mode */}
        {showTabs && (
          <div className="flex border-b border-gray-700">
            <button
              type="button"
              onClick={() => setActiveTab("drive")}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
                activeTab === "drive"
                  ? "border-b-2 border-blue-500 text-blue-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              From Drive
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("search")}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
                activeTab === "search"
                  ? "border-b-2 border-blue-500 text-blue-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Search Past Comps
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {/* ─── Search tab ─── */}
          {activeTab === "search" && showTabs && (
            <SearchPanel
              projectId={projectId}
              compType={compType}
              compsFolderId={compsFolderId}
              onCloneComplete={(compId, newComp) => {
                const typeSlug = routeSlugForCompType(compType);
                onComplete(compId, newComp);
                router.push(`/project/${projectId}/${typeSlug}/comps/${compId}`);
              }}
            />
          )}

          {/* ─── Drive tab / parse-only mode ─── */}
          {(activeTab === "drive" || !showTabs) && (
            <>
              {step === "select-folder" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    Select a Drive folder for this{" "}
                    {compType.toLowerCase()} comp.
                  </p>
                  {isLoading ? (
                    <div className="py-8 text-center text-sm text-gray-500">
                      Loading Drive folders…
                    </div>
                  ) : folders.length === 0 ? (
                    <div className="rounded-md border border-dashed border-gray-700 bg-gray-800/50 py-8 text-center text-sm text-gray-500">
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
                                ? "cursor-not-allowed text-gray-600 opacity-50"
                                : "text-gray-300 hover:bg-gray-800"
                            }`}
                          >
                            <span className="text-base">📁</span>
                            <span className="flex-1 truncate">{folder.name}</span>
                            {isUsed && (
                              <span className="shrink-0 rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
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
                    <p className="text-sm text-gray-400">
                      {selectedFolderName
                        ? `Files in "${selectedFolderName}"`
                        : "Select files to extract comp data from."}
                    </p>
                    {files.length > 0 && (
                      <button
                        type="button"
                        onClick={selectAllFiles}
                        className="text-xs font-medium text-blue-400 hover:text-blue-300"
                      >
                        Select all
                      </button>
                    )}
                  </div>

                  {isLoading ? (
                    <div className="py-8 text-center text-sm text-gray-500">
                      Loading files…
                    </div>
                  ) : files.length === 0 ? (
                    <div className="rounded-md border border-dashed border-gray-700 bg-gray-800/50 py-8 text-center text-sm text-gray-500">
                      No files found in this folder.
                    </div>
                  ) : (
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {files.map((file) => (
                        <label
                          key={file.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-gray-800"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFileIds.has(file.id)}
                            onChange={() => toggleFileSelection(file.id)}
                            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
                          />
                          <span className="text-sm text-gray-300">
                            {file.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">
                      Extra Context (optional)
                    </label>
                    <textarea
                      value={extraContext}
                      onChange={(e) => setExtraContext(e.target.value)}
                      placeholder="Any additional details to help with extraction…"
                      rows={2}
                      className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                        className="flex-1 rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
                      >
                        Back
                      </button>
                    )}
                    <button
                      onClick={() => void handleParse()}
                      disabled={selectedFileIds.size === 0}
                      className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                    >
                      Parse {selectedFileIds.size} File
                      {selectedFileIds.size !== 1 ? "s" : ""}
                    </button>
                  </div>
                </div>
              )}

              {step === "parsing" && (
                <div className="space-y-3 py-12 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <p className="text-sm font-medium text-gray-300">
                    {isAddMode
                      ? "Creating comp & extracting data with AI…"
                      : "Extracting comp data with AI…"}
                  </p>
                  <p className="text-xs text-gray-500">
                    This may take 15–30 seconds.
                  </p>
                </div>
              )}

              {step === "done" && (
                <div className="space-y-4 py-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-900/40 text-2xl text-green-400">
                    ✓
                  </div>
                  <p className="text-sm font-medium text-gray-300">
                    Successfully parsed {parsedCount} file
                    {parsedCount !== 1 ? "s" : ""}!
                  </p>
                  <button
                    onClick={() => {
                      if (resultCompId) onComplete(resultCompId);
                      onClose();
                    }}
                    className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                  >
                    View Comp Data
                  </button>
                </div>
              )}

              {step === "error" && (
                <div className="space-y-4 py-4">
                  <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
                    {errorMessage ?? "An error occurred"}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setErrorMessage(null);
                        setStep("select-folder");
                      }}
                      className="flex-1 rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
                    >
                      Retry
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
