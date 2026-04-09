"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  XMarkIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  PlusIcon,
  EyeIcon,
  ArrowLeftIcon,
  TrashIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { createClient } from "~/utils/supabase/client";
import { useProject } from "~/hooks/useProject";
import { DriveFolderBrowser } from "~/components/DriveFolderBrowser";
import { DeleteDocumentConfirmDialog } from "~/components/DeleteDocumentConfirmDialog";
import { deleteProjectDocument } from "~/lib/supabase-queries";
import type { ProjectFolderStructure } from "~/utils/projectStore";
import {
  DOCUMENT_TYPE_BADGE_CLASS,
  formatDocumentTypeShort,
  getDocumentPrimaryTitle,
  getDocumentSectionTagLabel,
  structuredEntriesForDisplay,
} from "~/utils/document-display";
import { driveFetch } from "~/lib/drive-fetch";
import { onDriveAuthRestored } from "~/lib/drive-auth-event";

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

function panelDocHasProcessingError(doc: ProjectDocument): boolean {
  return (
    !doc.processed_at &&
    !!doc.structured_data &&
    typeof doc.structured_data === "object" &&
    "processing_error" in doc.structured_data
  );
}

function panelIsProcessingDoc(
  doc: ProjectDocument,
  reprocessingIds: Set<string>,
): boolean {
  return (
    !doc.processed_at && (!!doc.file_id || reprocessingIds.has(doc.id))
  );
}

function DocumentPreviewStatusPill({
  doc,
  reprocessingIds,
}: {
  doc: ProjectDocument;
  reprocessingIds: Set<string>;
}) {
  const processing = panelIsProcessingDoc(doc, reprocessingIds);
  const reprocessing = reprocessingIds.has(doc.id);
  const err = panelDocHasProcessingError(doc);
  const done = !!doc.processed_at && !err;
  const errorMessage = err
    ? String(
        (doc.structured_data as { processing_error?: string })
          .processing_error ?? "Unknown error",
      )
    : null;

  if (processing || reprocessing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-200">
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-sky-600 border-t-transparent dark:border-sky-400"
          aria-hidden
        />
        Processing…
      </span>
    );
  }

  if (err) {
    return (
      <span
        className="inline-flex max-w-full items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
        title={errorMessage ?? undefined}
      >
        Error
      </span>
    );
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircleIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
        Processed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400">
      Pending
    </span>
  );
}

const DOCUMENT_PANEL_WIDTH_KEY = "document-context-panel-width";
const DOCUMENT_PANEL_DEFAULT_WIDTH = 448;
const DOCUMENT_PANEL_MIN_WIDTH = 280;
const DOCUMENT_PANEL_MAX_WIDTH = 960;

function clampDocPanelWidth(px: number): number {
  if (typeof window === "undefined") {
    return Math.min(
      DOCUMENT_PANEL_MAX_WIDTH,
      Math.max(DOCUMENT_PANEL_MIN_WIDTH, px),
    );
  }
  const maxByViewport = Math.max(
    DOCUMENT_PANEL_MIN_WIDTH,
    Math.floor(window.innerWidth * 0.88),
  );
  const max = Math.min(DOCUMENT_PANEL_MAX_WIDTH, maxByViewport);
  return Math.min(max, Math.max(DOCUMENT_PANEL_MIN_WIDTH, px));
}

function inlinePreviewKind(
  fileName: string | null | undefined,
): "image" | "pdf" | "embed" {
  const n = fileName?.toLowerCase() ?? "";
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.exec(n)) return "image";
  return "embed";
}

/** Google Drive triangle logo (opens file in Drive). */
function DriveFileOpenIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 87.3 78"
      className={className}
      aria-hidden
    >
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
        fill="#ea4335"
      />
      <path
        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  );
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
  const [previewDriveFile, setPreviewDriveFile] = useState<{
    documentId: string;
    fileId: string;
    fileName: string | null;
  } | null>(null);
  const [previewMetaExpanded, setPreviewMetaExpanded] = useState(false);

  const [panelWidth, setPanelWidth] = useState(DOCUMENT_PANEL_DEFAULT_WIDTH);
  const [isResizingDocPanel, setIsResizingDocPanel] = useState(false);
  const docResizeDragRef = useRef<{
    startX: number;
    startWidth: number;
    edge: "left" | "right";
  } | null>(null);
  const panelWidthDuringResizeRef = useRef(panelWidth);

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

  const previewDoc = useMemo(() => {
    if (!previewDriveFile) return null;
    return (
      documents.find((d) => d.id === previewDriveFile.documentId) ?? null
    );
  }, [documents, previewDriveFile]);

  useEffect(() => {
    setPreviewMetaExpanded(false);
  }, [previewDriveFile?.documentId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCUMENT_PANEL_WIDTH_KEY);
      if (raw == null) return;
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n)) setPanelWidth(clampDocPanelWidth(n));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isResizingDocPanel) return;

    const onMove = (e: PointerEvent) => {
      const drag = docResizeDragRef.current;
      if (!drag) return;
      const delta =
        drag.edge === "left"
          ? drag.startX - e.clientX
          : e.clientX - drag.startX;
      const next = clampDocPanelWidth(drag.startWidth + delta);
      panelWidthDuringResizeRef.current = next;
      setPanelWidth(next);
    };

    const onUp = () => {
      docResizeDragRef.current = null;
      setIsResizingDocPanel(false);
      try {
        localStorage.setItem(
          DOCUMENT_PANEL_WIDTH_KEY,
          String(panelWidthDuringResizeRef.current),
        );
      } catch {
        /* ignore */
      }
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isResizingDocPanel]);

  useEffect(() => {
    panelWidthDuringResizeRef.current = panelWidth;
  }, [panelWidth]);

  const onDocResizePointerDown = useCallback(
    (edge: "left" | "right") => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      panelWidthDuringResizeRef.current = panelWidth;
      docResizeDragRef.current = {
        startX: e.clientX,
        startWidth: panelWidth,
        edge,
      };
      setIsResizingDocPanel(true);
    },
    [panelWidth],
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
    const deletedId = deleteConfirm.id;
    setIsDeletingDoc(true);
    try {
      await deleteProjectDocument(deletedId);
      setDeleteConfirm(null);
      setPreviewDriveFile((prev) =>
        prev?.documentId === deletedId ? null : prev,
      );
      await fetchDocuments();
    } catch (err) {
      console.error("[DocumentContextPanel] delete document:", err);
    } finally {
      setIsDeletingDoc(false);
    }
  }, [deleteConfirm, fetchDocuments]);

  const handleReprocess = useCallback(async (docId: string) => {
    setReprocessingIds((prev) => new Set(prev).add(docId));
    try {
      const res = await driveFetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprocess", documentId: docId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        console.error("Reprocess error:", data.error ?? res.status);
      }
    } catch (err) {
      console.error("Reprocess error:", err);
    } finally {
      setReprocessingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  }, []);

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
        const res = await driveFetch("/api/documents", {
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
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
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

  const previewFileId = previewDoc?.file_id ?? previewDriveFile?.fileId ?? null;
  const previewFileName =
    previewDoc?.file_name ?? previewDriveFile?.fileName ?? null;
  const previewIsReprocessing = previewDoc
    ? reprocessingIds.has(previewDoc.id)
    : false;
  const previewStatus = previewIsReprocessing
    ? "processing"
    : previewDoc
      ? getDocStatus(previewDoc)
      : "unprocessed";
  const previewIsRowProcessing = previewStatus === "processing";
  const previewCanReprocess =
    !!previewDoc?.file_id &&
    !previewIsRowProcessing &&
    !previewIsReprocessing;
  const previewMetaEntries = previewDoc
    ? structuredEntriesForDisplay(previewDoc.structured_data)
    : [];

  if (!isOpen && deleteConfirm === null) return null;

  const renderPanelViews = () => (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-white dark:bg-gray-950">
      {previewDriveFile && previewFileId ? (
        <>
          <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-3 dark:border-gray-800 md:px-5 md:py-4">
            <button
              type="button"
              onClick={() => setPreviewDriveFile(null)}
              className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title="Back to document list"
              aria-label="Back to document list"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div className="min-w-0 max-w-[11rem] sm:max-w-[13rem] md:max-w-[15rem]">
              <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {getDocumentPrimaryTitle(
                  previewDoc?.document_label,
                  previewDoc?.file_name,
                ) ||
                  (() => {
                    const t = previewDriveFile.fileName?.trim();
                    return t !== undefined && t !== "" ? t : "Document";
                  })()}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-500">
                Preview — compare while you edit
              </p>
            </div>
            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3 md:gap-4">
              <div className="flex items-center gap-1">
                {previewDoc && previewIsRowProcessing ? (
                  <ArrowPathIcon
                    className="h-4 w-4 shrink-0 animate-spin text-blue-400"
                    aria-label="Processing"
                  />
                ) : null}
                {previewDoc && previewCanReprocess ? (
                  <button
                    type="button"
                    onClick={() => void handleReprocess(previewDoc.id)}
                    className="rounded p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-blue-700 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                    title="Reprocess document from Drive"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    <span className="sr-only">Reprocess</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setDeleteConfirm({
                      id: previewDriveFile.documentId,
                      fileName:
                        previewDoc?.file_name ?? previewDriveFile.fileName,
                    })
                  }
                  className="rounded p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                  title="Delete document"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  <span className="sr-only">Delete document</span>
                </button>
                <a
                  href={`https://drive.google.com/file/d/${previewFileId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  title="Open in Google Drive"
                  aria-label="Open in Google Drive"
                >
                  <DriveFileOpenIcon className="h-[18px] w-auto" />
                </a>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                aria-label="Close document panel"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          {previewDoc ? (
            <div className="shrink-0 border-b border-gray-200 bg-gray-50/90 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40 md:px-5">
              <p
                className={`text-xs leading-relaxed text-gray-600 dark:text-gray-400 ${
                  previewMetaExpanded ? "" : "line-clamp-2"
                }`}
              >
                {(() => {
                  const t = previewDoc.extracted_text?.trim();
                  return t !== undefined && t !== ""
                    ? t
                    : "No extracted summary yet.";
                })()}
              </p>
              <button
                type="button"
                className="mx-auto mt-1 flex w-full items-center justify-center rounded py-0.5 text-gray-500 transition hover:bg-gray-200/90 dark:hover:bg-gray-800/50"
                aria-expanded={previewMetaExpanded}
                aria-label={
                  previewMetaExpanded ? "Collapse details" : "Expand details"
                }
                onClick={() => setPreviewMetaExpanded((v) => !v)}
              >
                <ChevronDownIcon
                  className={`h-4 w-4 transition ${previewMetaExpanded ? "rotate-180" : ""}`}
                />
              </button>
              {previewMetaExpanded ? (
                <div className="mt-2 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                        DOCUMENT_TYPE_BADGE_CLASS[previewDoc.document_type] ??
                        DOCUMENT_TYPE_BADGE_CLASS.other
                      }`}
                    >
                      {formatDocumentTypeShort(
                        previewDoc.document_type,
                        previewDoc.structured_data,
                      )}
                    </span>
                    {previewDoc.section_tag ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700 dark:border-zinc-600/50 dark:bg-zinc-800/60 dark:text-zinc-400">
                        <TagIcon className="h-3 w-3 shrink-0" />
                        {getDocumentSectionTagLabel(previewDoc.section_tag) ??
                          previewDoc.section_tag}
                      </span>
                    ) : null}
                    <DocumentPreviewStatusPill
                      doc={previewDoc}
                      reprocessingIds={reprocessingIds}
                    />
                  </div>
                  {previewDoc.extracted_text?.trim() ? (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">
                        Extracted text
                      </p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-white p-2 text-[11px] leading-relaxed text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                        {previewDoc.extracted_text}
                      </pre>
                    </div>
                  ) : null}
                  {previewMetaEntries.length > 0 ? (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">
                        Structured data
                        <span className="ml-1 font-normal normal-case text-gray-600 dark:text-gray-400">
                          ({previewMetaEntries.length} field
                          {previewMetaEntries.length === 1 ? "" : "s"})
                        </span>
                      </p>
                      <dl className="space-y-2 rounded-lg border border-gray-200 bg-white p-2 text-[11px] dark:border-zinc-800 dark:bg-zinc-950">
                        {previewMetaEntries.map(([k, v]) => (
                          <div
                            key={k}
                            className="grid gap-1 border-b border-gray-100 pb-2 last:border-0 last:pb-0 dark:border-zinc-800/80"
                          >
                            <dt className="font-medium text-gray-600 dark:text-zinc-500">
                              {k}
                            </dt>
                            <dd className="break-words text-gray-800 dark:text-zinc-300">
                              {v}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DocumentPanelInlinePreview
              fileId={previewFileId}
              fileName={previewFileName}
            />
          </div>
        </>
      ) : (
        <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800 md:px-6 md:py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Document Context
          </h2>
          <p className="text-xs text-gray-600 dark:text-gray-500">
            {headerSubtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Close document panel"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {/* Inline Add Browser */}
          {showAddBrowser && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Select a file to add
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBrowser(false);
                    setAddError(null);
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <ArrowLeftIcon className="h-3 w-3" />
                  Cancel
                </button>
              </div>
              {addError && (
                <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {addError}
                </p>
              )}
              {isAdding ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-500" />
                  <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">
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
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200/90">
                  No Drive folder configured for this section. Go to the{" "}
                  <a
                    href={`/project/${projectId}/documents`}
                    className="underline hover:text-amber-950 dark:hover:text-amber-100"
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
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 dark:border-gray-700 dark:border-t-blue-500" />
                </div>
              ) : (
                <>
                  {scopedDocs.length > 0 && (
                    <div className="mb-6">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-500">
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
                            onPreviewDriveFile={(payload) =>
                              setPreviewDriveFile(payload)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {otherDocs.length > 0 && (
                    <div className="mb-6">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-500">
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
                            onPreviewDriveFile={(payload) =>
                              setPreviewDriveFile(payload)
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
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-500">
                          Photo Context
                        </h3>
                        {/* Global include/exclude toggle */}
                        <button
                          type="button"
                          onClick={handleToggleIncludePhotos}
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                            includePhotos
                              ? "bg-blue-100 text-blue-800 hover:bg-blue-200/80 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                          }`}
                          title={includePhotos ? "Exclude photos from AI context" : "Include photos in AI context"}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              includePhotos
                                ? "bg-blue-600 dark:bg-blue-400"
                                : "bg-gray-400 dark:bg-gray-600"
                            }`}
                          />
                          {includePhotos ? "Photos included" : "Photos excluded"}
                        </button>
                      </div>

                      {isLoadingPhotos ? (
                        <div className="flex items-center gap-2 py-3">
                          <div className="h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-500" />
                          <span className="text-xs text-gray-600 dark:text-gray-500">Loading photos…</span>
                        </div>
                      ) : photos.length === 0 ? (
                        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-500">
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
                              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/50"
                            >
                              <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-200">
                                {photo.label}
                              </p>
                              {photo.description && (
                                <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-gray-600 dark:text-gray-500">
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
        <div className="shrink-0 space-y-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800 md:px-6">
          {!showAddBrowser && (
            <button
              type="button"
              onClick={() => setShowAddBrowser(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-700 dark:bg-gray-900 dark:hover:bg-gray-800"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add Document
            </button>
          )}
          <a
            href={`/project/${projectId}/documents`}
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-xs text-gray-500 transition hover:text-gray-800 dark:text-gray-600 dark:hover:text-gray-400"
          >
            Manage all documents →
          </a>
        </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <DeleteDocumentConfirmDialog
        isOpen={deleteConfirm !== null}
        fileName={deleteConfirm?.fileName}
        isDeleting={isDeletingDoc}
        onCancel={() => {
          if (!isDeletingDoc) setDeleteConfirm(null);
        }}
        onConfirm={() => void handleConfirmDeleteDoc()}
      />

      {isOpen ? (
        <>
      <div
        className="relative hidden h-full shrink-0 border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 md:flex"
        style={{ width: panelWidth }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize document panel — drag left edge"
          aria-valuenow={panelWidth}
          aria-valuemin={DOCUMENT_PANEL_MIN_WIDTH}
          aria-valuemax={DOCUMENT_PANEL_MAX_WIDTH}
          tabIndex={0}
          className={`absolute left-0 top-0 z-10 h-full w-3 -translate-x-1/2 touch-none select-none md:cursor-col-resize ${
            isResizingDocPanel
              ? "bg-blue-500/30"
              : "hover:bg-gray-200/90 dark:hover:bg-gray-800/80"
          }`}
          onPointerDown={onDocResizePointerDown("left")}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 32 : 16;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setPanelWidth((w) => {
                const next = clampDocPanelWidth(w + step);
                try {
                  localStorage.setItem(DOCUMENT_PANEL_WIDTH_KEY, String(next));
                } catch {
                  /* ignore */
                }
                return next;
              });
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              setPanelWidth((w) => {
                const next = clampDocPanelWidth(w - step);
                try {
                  localStorage.setItem(DOCUMENT_PANEL_WIDTH_KEY, String(next));
                } catch {
                  /* ignore */
                }
                return next;
              });
            }
          }}
        />
        <div className="relative z-0 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {renderPanelViews()}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize document panel — drag right edge"
          aria-valuenow={panelWidth}
          aria-valuemin={DOCUMENT_PANEL_MIN_WIDTH}
          aria-valuemax={DOCUMENT_PANEL_MAX_WIDTH}
          tabIndex={0}
          className={`absolute right-0 top-0 z-10 h-full w-3 translate-x-1/2 touch-none select-none md:cursor-col-resize ${
            isResizingDocPanel
              ? "bg-blue-500/30"
              : "hover:bg-gray-200/90 dark:hover:bg-gray-800/80"
          }`}
          onPointerDown={onDocResizePointerDown("right")}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 32 : 16;
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setPanelWidth((w) => {
                const next = clampDocPanelWidth(w + step);
                try {
                  localStorage.setItem(DOCUMENT_PANEL_WIDTH_KEY, String(next));
                } catch {
                  /* ignore */
                }
                return next;
              });
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              setPanelWidth((w) => {
                const next = clampDocPanelWidth(w - step);
                try {
                  localStorage.setItem(DOCUMENT_PANEL_WIDTH_KEY, String(next));
                } catch {
                  /* ignore */
                }
                return next;
              });
            }
          }}
        />
      </div>

      <div className="fixed inset-0 z-50 md:hidden">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          role="presentation"
          onClick={onClose}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-14 flex min-h-0 flex-col border-t border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
          <div className="pointer-events-auto flex h-full min-h-0 flex-col">
            {renderPanelViews()}
          </div>
        </div>
      </div>
        </>
      ) : null}
    </>
  );
}

function DocumentPanelInlinePreview({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string | null;
}) {
  const apiUrl = `/api/drive/file/${fileId}`;
  const kind = inlinePreviewKind(fileName);
  const title =
    fileName != null && fileName.trim() !== "" ? fileName.trim() : "Document";

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    return onDriveAuthRestored(() => setReloadToken((n) => n + 1));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    void (async () => {
      try {
        const res = await driveFetch(apiUrl);
        if (cancelled) return;
        if (!res.ok) {
          let message = `Could not load preview (${res.status})`;
          try {
            const j = (await res.json()) as { error?: string };
            if (j.error) message = j.error;
          } catch {
            /* use default */
          }
          setError(message);
          setLoading(false);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      } catch {
        if (!cancelled) setError("Failed to load preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, reloadToken]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-gray-100 text-sm text-gray-500 dark:bg-gray-950/50 dark:text-gray-400">
        Loading preview…
      </div>
    );
  }

  if (error ?? !blobUrl) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-gray-100 px-6 text-center dark:bg-gray-950/50">
        <p className="text-sm text-red-600 dark:text-red-400">
          {error ?? "Preview unavailable"}
        </p>
        <a
          href={`https://drive.google.com/file/d/${fileId}/view`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-blue-600 dark:text-blue-400"
        >
          Open in Drive instead
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-100 dark:bg-gray-950/50">
      {kind === "image" ? (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={blobUrl}
            alt={title}
            className="mx-auto block max-h-full max-w-full object-contain"
          />
        </div>
      ) : kind === "pdf" ? (
        <iframe
          title={title}
          src={blobUrl}
          className="min-h-0 w-full flex-1 border-0 bg-white dark:bg-gray-900"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <iframe
            title={title}
            src={blobUrl}
            className="h-full min-h-[320px] w-full flex-1 border-0 bg-white dark:bg-gray-900"
          />
          <p className="shrink-0 px-2 py-1.5 text-center text-[10px] text-gray-600 dark:text-gray-400">
            If the file does not display, use Open in Drive above.
          </p>
        </div>
      )}
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
  onPreviewDriveFile,
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
  onPreviewDriveFile: (payload: {
    documentId: string;
    fileId: string;
    fileName: string | null;
  }) => void;
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
      className={`rounded-lg border bg-gray-50 transition-opacity dark:bg-gray-900/50 ${
        isExcluded
          ? "border-gray-200/80 opacity-40 dark:border-gray-800/40"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        {showExcludeToggle ? (
          <button
            type="button"
            onClick={onToggleExclude}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              isExcluded
                ? "border-gray-300 bg-transparent text-transparent dark:border-gray-600"
                : "border-blue-600 bg-blue-100 text-blue-700 dark:border-blue-500 dark:bg-blue-500/20 dark:text-blue-400"
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
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-200">
                {getDocumentPrimaryTitle(doc.document_label, doc.file_name) ||
                  doc.document_type}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-500">{shortType}</p>
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
            <button
              type="button"
              onClick={() => {
                const id = doc.file_id;
                if (id) {
                  onPreviewDriveFile({
                    documentId: doc.id,
                    fileId: id,
                    fileName: doc.file_name,
                  });
                }
              }}
              className="rounded p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-blue-700 dark:hover:bg-gray-800 dark:hover:text-blue-400"
              title="View in panel"
            >
              <EyeIcon className="h-3.5 w-3.5" />
              <span className="sr-only">View document in panel</span>
            </button>
          ) : null}
          {canReprocess ? (
            <button
              type="button"
              onClick={onReprocess}
              className="rounded p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-blue-700 dark:hover:bg-gray-800 dark:hover:text-blue-400"
              title="Reprocess document from Drive"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              <span className="sr-only">Reprocess</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRequestDelete}
            className="rounded p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
            title="Delete document"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Delete document</span>
          </button>
        </div>
      </div>

      {isExpanded && doc.extracted_text ? (
        <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-800">
          <p className="max-h-32 overflow-y-auto text-xs leading-relaxed text-gray-600 whitespace-pre-wrap dark:text-gray-400">
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
  variant = "default",
  title: titleProp,
  /** When true, no native `title` (use when the parent shows a CSS hover hint). */
  omitNativeTitle = false,
}: {
  onClick: () => void;
  documentCount?: number;
  variant?: "default" | "icon";
  /** Hover / accessible name; default explains the documents drawer. */
  title?: string;
  omitNativeTitle?: boolean;
}) {
  const docDrawerTitle =
    titleProp ??
    "Open the documents panel: browse uploaded files (deeds, CAD, engagement letters) and their extracted text for this section.";
  const shortLabel = "Open documents panel";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        {...(omitNativeTitle
          ? { "aria-label": shortLabel }
          : { title: docDrawerTitle, "aria-label": docDrawerTitle })}
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700/60 dark:hover:text-gray-100 dark:focus-visible:ring-gray-400/50"
      >
        <DocumentTextIcon className="h-4 w-4" aria-hidden />
        {documentCount !== undefined && documentCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-0.5 text-[10px] font-bold text-white dark:bg-blue-900/90 dark:text-blue-300">
            {documentCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={docDrawerTitle}
      className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      Docs
      {documentCount !== undefined && documentCount > 0 && (
        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
          {documentCount}
        </span>
      )}
    </button>
  );
}
