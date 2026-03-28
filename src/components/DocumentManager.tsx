"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";
import { DriveFolderBrowser } from "~/components/DriveFolderBrowser";
import type { ProjectFolderStructure } from "~/utils/projectStore";
import {
  fetchProjectDocuments,
  deleteProjectDocument,
  subscribeToProjectDocuments,
  type ProjectDocument,
} from "~/lib/supabase-queries";

const DOCUMENT_TYPES = [
  { value: "deed", label: "Deed Record" },
  { value: "flood_map", label: "Flood Map" },
  { value: "cad", label: "CAD / Tax Record" },
  { value: "zoning_map", label: "Zoning Map" },
  { value: "neighborhood_map", label: "Neighborhood Map" },
  { value: "location_map", label: "Location Map" },
  { value: "engagement", label: "Engagement Letter" },
  { value: "other", label: "Other" },
] as const;

type DocumentTypeValue = (typeof DOCUMENT_TYPES)[number]["value"];

const TYPE_BADGE_CLASS: Record<string, string> = {
  deed: "border-amber-600/40 bg-amber-950/60 text-amber-200",
  flood_map: "border-sky-600/40 bg-sky-950/60 text-sky-200",
  cad: "border-violet-600/40 bg-violet-950/60 text-violet-200",
  zoning_map: "border-emerald-600/40 bg-emerald-950/60 text-emerald-200",
  neighborhood_map: "border-teal-600/40 bg-teal-950/60 text-teal-200",
  location_map: "border-cyan-600/40 bg-cyan-950/60 text-cyan-200",
  engagement: "border-rose-600/40 bg-rose-950/60 text-rose-200",
  other: "border-zinc-600/40 bg-zinc-800/80 text-zinc-300",
};

const TEXT_PREVIEW_LEN = 200;

type AddSourceMode = "browse" | "manual";

interface DocumentManagerProps {
  projectId: string;
}

function getFolderStructure(project: unknown): ProjectFolderStructure | undefined {
  if (!project || typeof project !== "object") return undefined;
  const p = project as Record<string, unknown>;
  const a = p.folderStructure;
  const b = p.folder_structure;
  if (a && typeof a === "object") return a as ProjectFolderStructure;
  if (b && typeof b === "object") return b as ProjectFolderStructure;
  return undefined;
}

function browseRootFolderId(
  documentType: string,
  fs: ProjectFolderStructure | undefined,
  projectFolderId: string | undefined,
): string | null {
  const root = projectFolderId?.trim() ?? null;
  if (!fs) return root;

  switch (documentType) {
    case "deed":
    case "cad":
      return fs.subjectFolderId?.trim() ?? root;
    case "flood_map":
    case "zoning_map":
    case "neighborhood_map":
    case "location_map":
      return fs.reportMapsFolderId?.trim() ?? root;
    case "engagement":
      return fs.engagementFolderId?.trim() ?? root;
    case "other":
      return root;
    default:
      return root;
  }
}

function getTypeLabel(type: string) {
  return DOCUMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

function isProcessingDoc(doc: ProjectDocument, reprocessingIds: Set<string>) {
  return (
    !doc.processedAt &&
    (!!doc.fileId || reprocessingIds.has(doc.id))
  );
}

function hasProcessingError(doc: ProjectDocument) {
  return (
    !doc.processedAt &&
    doc.structuredData &&
    "processing_error" in doc.structuredData
  );
}

function structuredEntriesForDisplay(
  data: Record<string, unknown> | undefined,
): [string, string][] {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data)
    .filter(([k]) => k !== "processing_error")
    .map(([k, v]) => [
      k,
      v !== null && typeof v === "object"
        ? JSON.stringify(v, null, 2)
        : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : "",
    ]);
}

export function DocumentManager({ projectId }: DocumentManagerProps) {
  const { project } = useProject(projectId);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSourceMode, setAddSourceMode] = useState<AddSourceMode>("browse");
  const [addForm, setAddForm] = useState<{
    documentType: DocumentTypeValue;
    documentLabel: string;
    fileId: string;
    driveFileName: string;
  }>({
    documentType: "deed",
    documentLabel: "",
    fileId: "",
    driveFileName: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folderStructure = useMemo(
    () => getFolderStructure(project),
    [project],
  );

  const browseRootId = useMemo(
    () =>
      browseRootFolderId(
        addForm.documentType,
        folderStructure,
        project?.projectFolderId,
      ),
    [addForm.documentType, folderStructure, project?.projectFolderId],
  );

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await fetchProjectDocuments(projectId);
      if (isMountedRef.current) setDocuments(docs);
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadDocuments();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadDocuments]);

  useEffect(() => {
    if (!projectId) return;

    const channel = subscribeToProjectDocuments(projectId, (payload) => {
      if (!isMountedRef.current) return;

      if (
        (payload.eventType === "INSERT" || payload.eventType === "UPDATE") &&
        payload.new
      ) {
        setDocuments((prev) => {
          const idx = prev.findIndex((d) => d.id === payload.new!.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = payload.new!;
            return updated;
          }
          return [...prev, payload.new!];
        });

        if (payload.new.processedAt) {
          setReprocessingIds((prev) => {
            const next = new Set(prev);
            next.delete(payload.new!.id);
            return next;
          });
        }
      }

      if (payload.eventType === "DELETE" && payload.old) {
        setDocuments((prev) =>
          prev.filter((d) => d.id !== payload.old!.id),
        );
      }
    });

    return () => {
      void channel.unsubscribe();
    };
  }, [projectId]);

  const resetForm = () => {
    setAddForm({
      documentType: "deed",
      documentLabel: "",
      fileId: "",
      driveFileName: "",
    });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowAddForm(false);
    setError(null);
    setAddSourceMode("browse");
  };

  const handleAdd = async () => {
    if (!addForm.documentType) return;
    if (!selectedFile && !addForm.fileId.trim()) {
      setError("Please select a file from Drive, upload a file, or paste a file ID");
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append("projectId", projectId);
        formData.append("documentType", addForm.documentType);
        if (addForm.documentLabel.trim()) {
          formData.append("documentLabel", addForm.documentLabel.trim());
        }
        formData.append("file", selectedFile);

        const res = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to upload document");
        }
      } else {
        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            documentType: addForm.documentType,
            documentLabel: addForm.documentLabel.trim() || undefined,
            fileId: addForm.fileId.trim(),
            fileName: addForm.driveFileName.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to add document");
        }
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add document");
    } finally {
      setIsAdding(false);
    }
  };

  const handleReprocess = async (docId: string) => {
    setReprocessingIds((prev) => new Set(prev).add(docId));
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprocess", documentId: docId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to reprocess");
      }
    } catch (err) {
      console.error("Reprocess failed", err);
      setReprocessingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await deleteProjectDocument(docId);
    } catch (err) {
      console.error("Failed to delete document", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-600 border-t-sky-500"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-zinc-100">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-50">
            Project Documents
          </h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Upload or link Drive files to build project context for AI-assisted
            report generation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (showAddForm ? resetForm() : setShowAddForm(true))}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500"
        >
          {showAddForm ? "Cancel" : "Add Document"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {showAddForm && (
        <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/50 p-4 shadow-lg backdrop-blur-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Document type
              </label>
              <select
                value={addForm.documentType}
                onChange={(e) =>
                  setAddForm((f) => ({
                    ...f,
                    documentType: e.target.value as DocumentTypeValue,
                  }))
                }
                className="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Label (optional)
              </label>
              <input
                type="text"
                value={addForm.documentLabel}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, documentLabel: e.target.value }))
                }
                placeholder="e.g., Deed — Instrument #2024-1234"
                className="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-1 rounded-lg border border-zinc-700 bg-zinc-950/80 p-1">
            <button
              type="button"
              onClick={() => setAddSourceMode("browse")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                addSourceMode === "browse"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Browse Drive
            </button>
            <button
              type="button"
              onClick={() => setAddSourceMode("manual")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                addSourceMode === "manual"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Upload / Manual
            </button>
          </div>

          {addSourceMode === "browse" && (
            <div className="mt-4 space-y-3">
              {!browseRootId ? (
                <p className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200/90">
                  No Drive folder is configured for this document type. Set a
                  project Drive folder or complete project discovery so
                  folder_structure includes the right subfolder IDs.
                </p>
              ) : (
                <>
                  <p className="text-xs text-zinc-500">
                    Pick a file from the folder scoped for this document type.
                  </p>
                  <DriveFolderBrowser
                    key={`${addForm.documentType}-${browseRootId}`}
                    rootFolderId={browseRootId}
                    rootFolderName={getTypeLabel(addForm.documentType)}
                    filter="files"
                    onSelect={(file) => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                      setAddForm((f) => ({
                        ...f,
                        fileId: file.id,
                        driveFileName: file.name,
                      }));
                    }}
                  />
                  {(addForm.fileId || addForm.driveFileName) && (
                    <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm">
                      <span className="text-zinc-500">Selected: </span>
                      <span className="font-medium text-zinc-200">
                        {addForm.driveFileName || "—"}
                      </span>
                      <span className="ml-2 font-mono text-xs text-zinc-500">
                        {addForm.fileId}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {addSourceMode === "manual" && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Upload file
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900">
                    <span>Choose file</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.csv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setSelectedFile(file);
                        if (file) {
                          setAddForm((f) => ({
                            ...f,
                            fileId: "",
                            driveFileName: "",
                          }));
                        }
                      }}
                    />
                  </label>
                  {selectedFile && (
                    <span className="text-sm text-zinc-400">
                      {selectedFile.name}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-px flex-1 bg-zinc-700" />
                  <span className="text-xs text-zinc-500">
                    or paste Drive file ID
                  </span>
                  <div className="h-px flex-1 bg-zinc-700" />
                </div>
                <input
                  type="text"
                  value={addForm.fileId}
                  onChange={(e) => {
                    setAddForm((f) => ({
                      ...f,
                      fileId: e.target.value,
                      driveFileName:
                        e.target.value.trim() ? f.driveFileName : "",
                    }));
                    if (e.target.value.trim()) {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }
                  }}
                  placeholder="Google Drive file ID"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={
                isAdding ||
                !addForm.documentType ||
                (!selectedFile && !addForm.fileId.trim())
              }
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isAdding ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Adding…
                </span>
              ) : (
                "Add & process"
              )}
            </button>
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-10 text-center">
          <p className="text-sm text-zinc-500">
            No documents yet. Add deed records, maps, and other files to build
            context.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <DocumentListCard
              key={doc.id}
              doc={doc}
              reprocessingIds={reprocessingIds}
              onReprocess={handleReprocess}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentListCard({
  doc,
  reprocessingIds,
  onReprocess,
  onDelete,
}: {
  doc: ProjectDocument;
  reprocessingIds: Set<string>;
  onReprocess: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [textOpen, setTextOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);

  const processing = isProcessingDoc(doc, reprocessingIds);
  const err = hasProcessingError(doc);
  const done = !!doc.processedAt && !err;
  const badgeClass =
    TYPE_BADGE_CLASS[doc.documentType] ?? TYPE_BADGE_CLASS.other;

  const displayName =
    doc.fileName?.trim() ??
    doc.documentLabel?.trim() ??
    "Untitled document";
  const subtitle =
    doc.fileName && doc.documentLabel && doc.documentLabel !== doc.fileName
      ? doc.documentLabel
      : null;

  const entries = structuredEntriesForDisplay(doc.structuredData);
  const text = doc.extractedText ?? "";
  const textPreview =
    text.length > TEXT_PREVIEW_LEN
      ? `${text.slice(0, TEXT_PREVIEW_LEN)}…`
      : text;

  const canReprocess =
    !!doc.fileId &&
    (done || err) &&
    !processing &&
    !reprocessingIds.has(doc.id);

  const driveUrl = doc.fileId
    ? `https://drive.google.com/file/d/${doc.fileId}/view`
    : null;

  const errorMessage = err
    ? String(
        (doc.structuredData as { processing_error?: string })
          .processing_error ?? "Unknown error",
      )
    : null;

  return (
    <li className="overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/40 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}
            >
              {getTypeLabel(doc.documentType)}
            </span>
            <DocumentStatusPill
              processing={processing}
              done={done}
              err={err}
              reprocessing={reprocessingIds.has(doc.id)}
              errorMessage={errorMessage}
            />
          </div>
          <div>
            <p className="text-base font-semibold leading-snug text-zinc-50">
              {displayName}
            </p>
            {subtitle && (
              <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
            )}
          </div>
          {driveUrl && (
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
            >
              View in Drive
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canReprocess && (
            <button
              type="button"
              onClick={() => onReprocess(doc.id)}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-700"
            >
              Reprocess
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(doc.id)}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-950/50 hover:text-red-400"
            title="Delete document"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {(text || entries.length > 0) && (
        <div className="space-y-0 border-t border-zinc-800 bg-zinc-950/30">
          {text ? (
            <ExpandableRow
              open={textOpen}
              onToggle={() => setTextOpen((o) => !o)}
              title="Extracted text"
              summary={textPreview || "—"}
            >
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">
                {text}
              </pre>
            </ExpandableRow>
          ) : null}
          {entries.length > 0 ? (
            <ExpandableRow
              open={dataOpen}
              onToggle={() => setDataOpen((o) => !o)}
              title="Structured data"
              summary={`${entries.length} field${entries.length === 1 ? "" : "s"}`}
            >
              <dl className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                {entries.map(([k, v]) => (
                  <div
                    key={k}
                    className="grid gap-1 border-b border-zinc-800/80 pb-2 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,8rem)_1fr] sm:gap-3"
                  >
                    <dt className="font-medium text-zinc-500">{k}</dt>
                    <dd className="break-words text-zinc-300">{v}</dd>
                  </div>
                ))}
              </dl>
            </ExpandableRow>
          ) : null}
        </div>
      )}
    </li>
  );
}

function ExpandableRow({
  open,
  onToggle,
  title,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-zinc-800/80 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-zinc-800/40"
      >
        {open ? (
          <ChevronDownIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {title}
          </span>
          <span className="mt-1 line-clamp-2 text-sm text-zinc-400">
            {summary}
          </span>
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-0">{children}</div>}
    </div>
  );
}

function DocumentStatusPill({
  processing,
  done,
  err,
  reprocessing,
  errorMessage,
}: {
  processing: boolean;
  done: boolean;
  err: boolean;
  reprocessing: boolean;
  errorMessage: string | null;
}) {
  if (processing || reprocessing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-800/60 bg-sky-950/50 px-2.5 py-0.5 text-xs font-medium text-sky-200">
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent"
          aria-hidden
        />
        Processing…
      </span>
    );
  }

  if (err) {
    return (
      <span
        className="inline-flex max-w-full items-center gap-1 rounded-full border border-red-900/60 bg-red-950/50 px-2.5 py-0.5 text-xs font-medium text-red-300"
        title={errorMessage ?? undefined}
      >
        Error
      </span>
    );
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-900/50 bg-emerald-950/40 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
        <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-400" />
        Processed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
      Pending
    </span>
  );
}
