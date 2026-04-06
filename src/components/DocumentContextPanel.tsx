"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  XMarkIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  PlusIcon,
  EyeIcon,
  ArrowLeftIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { createClient } from "~/utils/supabase/client";
import { useProject } from "~/hooks/useProject";
import { DriveFolderBrowser } from "~/components/DriveFolderBrowser";
import { DeleteDocumentConfirmDialog } from "~/components/DeleteDocumentConfirmDialog";
import { deleteProjectDocument } from "~/lib/supabase-queries";
import type { ProjectFolderStructure } from "~/utils/projectStore";
import {
  formatDocumentTypeShort,
  getDocumentPrimaryTitle,
} from "~/utils/document-display";

interface ProjectDocument {
  id: string;
  document_type: string;
  document_label: string | null;
  file_id: string | null;
  file_name: string | null;
  extracted_text: string | null;
  structured_data: Record<string, unknown> | null;
  processed_at: string | null;
  drive_modified_at: string | null;
  section_tag: string | null;
  created_at: string;
}

interface PhotoEntry {
  id: string;
  label: string;
  description: string | null;
  sort_order: number;
}

type DocStatus = "processed" | "stale" | "unprocessed" | "processing";

function getDocStatus(doc: ProjectDocument): DocStatus {
  if (!doc.processed_at) return doc.file_id ? "processing" : "unprocessed";
  if (
    doc.drive_modified_at &&
    new Date(doc.drive_modified_at) > new Date(doc.processed_at)
  ) {
    return "stale";
  }
  return "processed";
}

const SECTION_DOCUMENT_MAP: Record<string, string[]> = {
  flood_map: ["flood_map"],
  subject: ["deed", "cad", "flood_map", "engagement"],
  ownership: ["deed"],
  zoning: ["zoning_map"],
  neighborhood: ["neighborhood_map"],
  "subject-site-summary": ["flood_map", "deed"],
  "highest-best-use": [],
  "comp-detail": [],
};

/**
 * Maps a sectionKey to the section_tag value stored on documents.
 * Comp detail pages pass sectionKeys like "sales-comp-1".
 */
function sectionKeyToTag(sectionKey: string): string | null {
  // comp detail pages: sectionKey is something like "comp-detail" with
  // an optional compTag passed separately — return null here
  if (sectionKey === "comp-detail") return null;
  // Analysis/subject pages map 1:1 to tags
  const MAP: Record<string, string> = {
    subject: "subject",
    ownership: "ownership",
    zoning: "zoning",
    neighborhood: "neighborhood",
    flood_map: "flood-map",
    "subject-site-summary": "subject",
    "highest-best-use": "subject",
  };
  return MAP[sectionKey] ?? null;
}

/**
 * Determines the Drive folder to pre-navigate to when adding a doc
 * from a given section.
 */
/** Subtitle under "Document Context" — comp detail uses section tag like sales-comp-1. */
function documentPanelSubtitle(
  sectionKey: string,
  sectionTagOverride: string | undefined,
): string {
  if (sectionKey === "comp-detail" && sectionTagOverride?.trim()) {
    const m = /^(land|sales|rentals)-comp-(.+)$/.exec(
      sectionTagOverride.trim(),
    );
    if (m) {
      const slug = m[1];
      const num = m[2];
      const kind =
        slug === "land"
          ? "Land"
          : slug === "sales"
            ? "Sales"
            : "Rentals";
      return `for ${kind} Comp #${num}`;
    }
  }
  return `${sectionKey.replace(/-/g, " ")} section`;
}

function folderIdForSection(
  sectionKey: string,
  fs: ProjectFolderStructure | undefined,
  compFolderId: string | undefined,
): string | null {
  if (!fs) return null;

  if (compFolderId) return compFolderId;

  switch (sectionKey) {
    case "ownership":
    case "subject":
    case "subject-site-summary":
    case "highest-best-use":
      return fs.subjectFolderId ?? null;
    case "zoning":
    case "flood_map":
    case "neighborhood":
      return fs.reportMapsFolderId ?? fs.subjectFolderId ?? null;
    default:
      return fs.subjectFolderId ?? null;
  }
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

interface DocumentContextPanelProps {
  projectId: string;
  sectionKey: string;
  isOpen: boolean;
  onClose: () => void;
  /** When set, the inline browser starts here and documents are filtered to this tag. */
  compFolderId?: string;
  /** Explicit section_tag override (e.g. "sales-comp-1"). */
  sectionTag?: string;
  /** Called whenever the set of excluded document IDs changes. */
  onExcludedIdsChange?: (excludedIds: Set<string>) => void;
  /** When true, show a "Photo Context" section listing subject photos with a toggle. */
  showPhotoContext?: boolean;
  /** Called whenever the user toggles photo context inclusion. */
  onPhotoContextChange?: (includePhotos: boolean) => void;
}

export function DocumentContextPanel({
  projectId,
  sectionKey,
  isOpen,
  onClose,
  compFolderId,
  sectionTag: sectionTagProp,
  onExcludedIdsChange,
  showPhotoContext,
  onPhotoContextChange,
}: DocumentContextPanelProps) {
  const { project } = useProject(projectId);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [showAddBrowser, setShowAddBrowser] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Photo context state (only used when showPhotoContext=true)
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(true);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    fileName: string | null;
  } | null>(null);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);

  const showDocExcludeToggle = sectionKey !== "comp-detail";

  const folderStructure = useMemo(
    () => getFolderStructure(project),
    [project],
  );

  const relevantTypes = useMemo(
    () => SECTION_DOCUMENT_MAP[sectionKey] ?? [],
    [sectionKey],
  );

  // The tag used to filter/scope documents for this section
  const effectiveSectionTag =
    sectionTagProp ?? sectionKeyToTag(sectionKey);

  // The folder to pre-navigate in the inline browser
  const browserRootFolderId = useMemo(
    () => folderIdForSection(sectionKey, folderStructure, compFolderId),
    [sectionKey, folderStructure, compFolderId],
  );

  const headerSubtitle = useMemo(
    () => documentPanelSubtitle(sectionKey, sectionTagProp),
    [sectionKey, sectionTagProp],
  );

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (data) {
      setDocuments(data as unknown as ProjectDocument[]);
    }
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (isOpen) void fetchDocuments();
  }, [isOpen, fetchDocuments]);

  useEffect(() => {
    if (!isOpen) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`doc-panel-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_documents",
          filter: `project_id=eq.${projectId}`,
        },
        () => void fetchDocuments(),
      )
      .subscribe();

    return () => void supabase.removeChannel(channel);
  }, [isOpen, projectId, fetchDocuments]);

  // Fetch photos when the panel opens and showPhotoContext is enabled
  useEffect(() => {
    if (!isOpen || !showPhotoContext) return;
    setIsLoadingPhotos(true);
    const supabase = createClient();
    void supabase
      .from("photo_analyses")
      .select("id, label, description, sort_order")
      .eq("project_id", projectId)
      .eq("is_included", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setPhotos((data ?? []) as PhotoEntry[]);
        setIsLoadingPhotos(false);
      });
  }, [isOpen, showPhotoContext, projectId]);

  const handleToggleIncludePhotos = useCallback(() => {
    setIncludePhotos((prev) => {
      const next = !prev;
      onPhotoContextChange?.(next);
      return next;
    });
  }, [onPhotoContextChange]);

  const handleConfirmDeleteDoc = useCallback(async () => {
    if (!deleteConfirm) return;
    setIsDeletingDoc(true);
    try {
      await deleteProjectDocument(deleteConfirm.id);
      setDeleteConfirm(null);
      await fetchDocuments();
    } catch (err) {
      console.error("[DocumentContextPanel] delete document:", err);
    } finally {
      setIsDeletingDoc(false);
    }
  }, [deleteConfirm, fetchDocuments]);

  const handleReprocess = useCallback(    async (docId: string) => {
      setReprocessingIds((prev) => new Set(prev).add(docId));
      try {
        await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reprocess", documentId: docId }),
        });
      } catch (err) {
        console.error("Reprocess error:", err);
      } finally {
        setReprocessingIds((prev) => {
          const next = new Set(prev);
          next.delete(docId);
          return next;
        });
      }
    },
    [],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExcluded = useCallback(
    (id: string) => {
      setExcludedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onExcludedIdsChange?.(next);
        return next;
      });
    },
    [onExcludedIdsChange],
  );

  const handleFileSelect = useCallback(
    async (file: { id: string; name: string; mimeType: string }) => {
      if (file.mimeType === "application/vnd.google-apps.folder") return;
      setIsAdding(true);
      setAddError(null);
      try {
        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            documentType: "other",
            fileName: file.name,
            fileId: file.id,
            sectionTag: effectiveSectionTag ?? undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to add document");
        }
        setShowAddBrowser(false);
      } catch (err) {
        setAddError(err instanceof Error ? err.message : "Failed to add document");
      } finally {
        setIsAdding(false);
      }
    },
    [projectId, effectiveSectionTag],
  );

  // Section-scoped docs (matching sectionTag or relevantTypes)
  const scopedDocs = useMemo(() => {
    if (effectiveSectionTag) {
      return documents.filter((d) => d.section_tag === effectiveSectionTag);
    }
    if (relevantTypes.length > 0) {
      return documents.filter((d) => relevantTypes.includes(d.document_type));
    }
    return documents;
  }, [documents, effectiveSectionTag, relevantTypes]);

  /** Explicit tag (e.g. comp detail) — show only matching docs, not the rest of the project. */
  const isStrictTagScope = sectionTagProp !== undefined;

  const otherDocs = useMemo(() => {
    if (isStrictTagScope) return [];
    if (effectiveSectionTag) {
      return documents.filter((d) => d.section_tag !== effectiveSectionTag);
    }
    if (relevantTypes.length > 0) {
      return documents.filter((d) => !relevantTypes.includes(d.document_type));
    }
    return [];
  }, [
    documents,
    effectiveSectionTag,
    relevantTypes,
    isStrictTagScope,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <DeleteDocumentConfirmDialog
        isOpen={deleteConfirm !== null}
        fileName={deleteConfirm?.fileName}
        isDeleting={isDeletingDoc}
        onCancel={() => {
          if (!isDeletingDoc) setDeleteConfirm(null);
        }}
        onConfirm={() => void handleConfirmDeleteDoc()}
      />

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — full-screen on mobile, right-side drawer on md+ */}
      <div className="absolute inset-x-0 bottom-0 top-14 flex flex-col border-t border-gray-800 bg-gray-950 shadow-2xl md:inset-x-auto md:inset-y-0 md:right-0 md:top-0 md:w-full md:max-w-md md:border-l md:border-t-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 md:px-6 md:py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">
              Document Context
            </h2>
            <p className="text-xs text-gray-500">{headerSubtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
            aria-label="Close document panel"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {/* Inline Add Browser */}
          {showAddBrowser && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Select a file to add
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBrowser(false);
                    setAddError(null);
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-800 hover:text-gray-300"
                >
                  <ArrowLeftIcon className="h-3 w-3" />
                  Cancel
                </button>
              </div>
              {addError && (
                <p className="mb-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                  {addError}
                </p>
              )}
              {isAdding ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
                  <span className="ml-2 text-xs text-gray-400">
                    Adding document…
                  </span>
                </div>
              ) : browserRootFolderId ? (
                <DriveFolderBrowser
                  rootFolderId={browserRootFolderId}
                  rootFolderName="Project"
                  filter="files"
                  onSelect={handleFileSelect}
                />
              ) : (
                <p className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
                  No Drive folder configured for this section. Go to the{" "}
                  <a
                    href={`/project/${projectId}/documents`}
                    className="underline hover:text-amber-100"
                    onClick={onClose}
                  >
                    Documents page
                  </a>{" "}
                  to add documents manually.
                </p>
              )}
            </div>
          )}

          {!showAddBrowser && (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
                </div>
              ) : (
                <>
                  {scopedDocs.length > 0 && (
                    <div className="mb-6">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          {effectiveSectionTag
                            ? `${sectionKey.replace(/-/g, " ")} documents`
                            : "Relevant Documents"}
                        </h3>
                        {excludedIds.size > 0 && (
                          <span className="text-[10px] text-amber-500/80">
                            {excludedIds.size} excluded
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {scopedDocs.map((doc) => (
                          <DocumentRow
                            key={doc.id}
                            doc={doc}
                            isExpanded={expandedIds.has(doc.id)}
                            isReprocessing={reprocessingIds.has(doc.id)}
                            isExcluded={excludedIds.has(doc.id)}
                            showExcludeToggle={showDocExcludeToggle}
                            onToggleExpand={() => toggleExpanded(doc.id)}
                            onReprocess={() => void handleReprocess(doc.id)}
                            onToggleExclude={() => toggleExcluded(doc.id)}
                            onRequestDelete={() =>
                              setDeleteConfirm({
                                id: doc.id,
                                fileName: doc.file_name,
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {otherDocs.length > 0 && (
                    <div className="mb-6">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Other Project Documents
                      </h3>
                      <div className="space-y-2">
                        {otherDocs.map((doc) => (
                          <DocumentRow
                            key={doc.id}
                            doc={doc}
                            isExpanded={expandedIds.has(doc.id)}
                            isReprocessing={reprocessingIds.has(doc.id)}
                            isExcluded={excludedIds.has(doc.id)}
                            showExcludeToggle={showDocExcludeToggle}
                            onToggleExpand={() => toggleExpanded(doc.id)}
                            onReprocess={() => void handleReprocess(doc.id)}
                            onToggleExclude={() => toggleExcluded(doc.id)}
                            onRequestDelete={() =>
                              setDeleteConfirm({
                                id: doc.id,
                                fileName: doc.file_name,
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {(documents.length === 0 ||
                    (isStrictTagScope &&
                      scopedDocs.length === 0 &&
                      documents.length > 0)) && (
                    <div className="py-12 text-center">
                      <p className="text-sm text-gray-500">
                        {isStrictTagScope && documents.length > 0
                          ? "No documents tagged for this comp yet."
                          : "No documents uploaded yet."}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        {isStrictTagScope
                          ? "Add a document from this comp's folder to tag and attach it here."
                          : 'Click "Add Document" to browse your Drive.'}
                      </p>
                    </div>
                  )}

                  {/* Photo Context Section */}
                  {showPhotoContext && (
                    <div className="mb-6">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Photo Context
                        </h3>
                        {/* Global include/exclude toggle */}
                        <button
                          type="button"
                          onClick={handleToggleIncludePhotos}
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                            includePhotos
                              ? "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
                              : "bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
                          }`}
                          title={includePhotos ? "Exclude photos from AI context" : "Include photos in AI context"}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              includePhotos ? "bg-blue-400" : "bg-gray-600"
                            }`}
                          />
                          {includePhotos ? "Photos included" : "Photos excluded"}
                        </button>
                      </div>

                      {isLoadingPhotos ? (
                        <div className="flex items-center gap-2 py-3">
                          <div className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-blue-500" />
                          <span className="text-xs text-gray-500">Loading photos…</span>
                        </div>
                      ) : photos.length === 0 ? (
                        <p className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-3 text-xs text-gray-500">
                          No analyzed photos found. Run photo analysis from the Subject Photos page first.
                        </p>
                      ) : (
                        <div
                          className={`space-y-1.5 transition-opacity ${
                            includePhotos ? "opacity-100" : "opacity-40"
                          }`}
                        >
                          {photos.map((photo) => (
                            <div
                              key={photo.id}
                              className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2"
                            >
                              <p className="truncate text-xs font-medium text-gray-200">
                                {photo.label}
                              </p>
                              {photo.description && (
                                <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-gray-500">
                                  {photo.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-4 py-3 space-y-2 md:px-6">
          {!showAddBrowser && (
            <button
              type="button"
              onClick={() => setShowAddBrowser(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-800 hover:text-gray-100"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add Document
            </button>
          )}
          <a
            href={`/project/${projectId}/documents`}
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-xs text-gray-600 transition hover:text-gray-400"
          >
            Manage all documents →
          </a>
        </div>
      </div>
    </div>
  );
}

function DocumentRow({
  doc,
  isExpanded,
  isReprocessing,
  isExcluded,
  showExcludeToggle,
  onToggleExpand,
  onReprocess,
  onToggleExclude,
  onRequestDelete,
}: {
  doc: ProjectDocument;
  isExpanded: boolean;
  isReprocessing: boolean;
  isExcluded: boolean;
  showExcludeToggle: boolean;
  onToggleExpand: () => void;
  onReprocess: () => void;
  onToggleExclude: () => void;
  onRequestDelete: () => void;
}) {
  const status = isReprocessing ? "processing" : getDocStatus(doc);
  const isRowProcessing = status === "processing";
  const canReprocess = !!doc.file_id && !isRowProcessing && !isReprocessing;
  const hasExtractPreview = !!doc.extracted_text?.trim();
  const shortType = formatDocumentTypeShort(
    doc.document_type,
    doc.structured_data,
  );

  return (
    <div
      className={`rounded-lg border bg-gray-900/50 transition-opacity ${
        isExcluded
          ? "border-gray-800/40 opacity-40"
          : "border-gray-800"
      }`}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        {showExcludeToggle ? (
          <button
            type="button"
            onClick={onToggleExclude}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              isExcluded
                ? "border-gray-600 bg-transparent text-transparent"
                : "border-blue-500 bg-blue-500/20 text-blue-400"
            }`}
            title={
              isExcluded
                ? "Excluded from context — click to include"
                : "Included in context — click to exclude"
            }
            aria-label={isExcluded ? "Include document" : "Exclude document"}
          >
            {!isExcluded && (
              <svg
                className="h-2.5 w-2.5"
                fill="none"
                viewBox="0 0 10 10"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M1.5 5l2.5 2.5 4.5-4.5"
                />
              </svg>
            )}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => hasExtractPreview && onToggleExpand()}
          disabled={!hasExtractPreview}
          className={`min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
            hasExtractPreview
              ? "cursor-pointer hover:opacity-90"
              : "cursor-default opacity-80"
          }`}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-200">
                {getDocumentPrimaryTitle(doc.document_label, doc.file_name) ||
                  doc.document_type}
              </p>
              <p className="text-xs text-gray-500">{shortType}</p>
            </div>
            {hasExtractPreview ? (
              <ChevronDownIcon
                className={`mt-0.5 h-4 w-4 shrink-0 text-gray-500 transition ${
                  isExpanded ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            ) : null}
          </div>
        </button>

        <div
          className="mt-0.5 flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          {isRowProcessing ? (
            <ArrowPathIcon
              className="h-4 w-4 shrink-0 animate-spin text-blue-400"
              aria-label="Processing"
            />
          ) : null}
          {doc.file_id ? (
            <a
              href={`https://drive.google.com/file/d/${doc.file_id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1.5 text-gray-500 transition hover:bg-gray-800 hover:text-blue-400"
              title="View in Google Drive"
            >
              <EyeIcon className="h-3.5 w-3.5" />
              <span className="sr-only">View in Google Drive</span>
            </a>
          ) : null}
          {canReprocess ? (
            <button
              type="button"
              onClick={onReprocess}
              className="rounded p-1.5 text-gray-500 transition hover:bg-gray-800 hover:text-blue-400"
              title="Reprocess document from Drive"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              <span className="sr-only">Reprocess</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRequestDelete}
            className="rounded p-1.5 text-gray-500 transition hover:bg-red-950/50 hover:text-red-400"
            title="Delete document"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Delete document</span>
          </button>
        </div>
      </div>

      {isExpanded && doc.extracted_text ? (
        <div className="border-t border-gray-800 px-3 py-2">
          <p className="max-h-32 overflow-y-auto text-xs leading-relaxed text-gray-400 whitespace-pre-wrap">
            {doc.extracted_text.substring(0, 1000)}
            {doc.extracted_text.length > 1000 && "..."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function DocumentPanelToggle({
  onClick,
  documentCount,
}: {
  onClick: () => void;
  documentCount?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:border-gray-600 hover:bg-gray-800 hover:text-gray-200"
      title="View document context"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      Docs
      {documentCount !== undefined && documentCount > 0 && (
        <span className="rounded-full bg-blue-900/50 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
          {documentCount}
        </span>
      )}
    </button>
  );
}
