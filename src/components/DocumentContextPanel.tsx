"use client";

import { useState, useEffect, useCallback } from "react";
import {
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  PlusIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { createClient } from "~/utils/supabase/client";

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
  created_at: string;
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

const STATUS_CONFIG: Record<
  DocStatus,
  { icon: typeof CheckCircleIcon; colorClass: string; label: string }
> = {
  processed: {
    icon: CheckCircleIcon,
    colorClass: "text-emerald-400",
    label: "Processed",
  },
  stale: {
    icon: ExclamationTriangleIcon,
    colorClass: "text-amber-400",
    label: "Outdated",
  },
  unprocessed: {
    icon: XCircleIcon,
    colorClass: "text-red-400",
    label: "Not Processed",
  },
  processing: {
    icon: ArrowPathIcon,
    colorClass: "text-blue-400 animate-spin",
    label: "Processing...",
  },
};

const SECTION_DOCUMENT_MAP: Record<string, string[]> = {
  flood_map: ["flood_map"],
  subject: ["deed", "cad", "flood_map", "engagement"],
  ownership: ["deed"],
  zoning: ["zoning_map"],
  neighborhood: ["neighborhood_map"],
  "subject-site-summary": ["flood_map", "deed"],
  "highest-best-use": [],
  /** Comp detail: show full project document list as relevant context. */
  "comp-detail": [],
};

interface DocumentContextPanelProps {
  projectId: string;
  sectionKey: string;
  isOpen: boolean;
  onClose: () => void;
  compFolderId?: string;
}

export function DocumentContextPanel({
  projectId,
  sectionKey,
  isOpen,
  onClose,
  compFolderId: _compFolderId,
}: DocumentContextPanelProps) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());

  const relevantTypes = SECTION_DOCUMENT_MAP[sectionKey] ?? [];

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

  const handleReprocess = useCallback(
    async (docId: string) => {
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

  const relevant = documents.filter(
    (d) => relevantTypes.length === 0 || relevantTypes.includes(d.document_type),
  );
  const other = documents.filter(
    (d) => relevantTypes.length > 0 && !relevantTypes.includes(d.document_type),
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative ml-auto flex h-full w-full max-w-md flex-col border-l border-gray-800 bg-gray-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">
              Document Context
            </h2>
            <p className="text-xs text-gray-500">
              {sectionKey.replace(/-/g, " ")} section
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
            </div>
          ) : (
            <>
              {relevant.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Relevant Documents
                  </h3>
                  <div className="space-y-2">
                    {relevant.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        isExpanded={expandedIds.has(doc.id)}
                        isReprocessing={reprocessingIds.has(doc.id)}
                        onToggleExpand={() => toggleExpanded(doc.id)}
                        onReprocess={() => void handleReprocess(doc.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {other.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Other Project Documents
                  </h3>
                  <div className="space-y-2">
                    {other.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        isExpanded={expandedIds.has(doc.id)}
                        isReprocessing={reprocessingIds.has(doc.id)}
                        onToggleExpand={() => toggleExpanded(doc.id)}
                        onReprocess={() => void handleReprocess(doc.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {documents.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500">
                    No documents uploaded yet.
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    Add documents from the Documents page to build context.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-6 py-3">
          <a
            href={`/project/${projectId}/documents`}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-800 hover:text-gray-100"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add Document
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
  onToggleExpand,
  onReprocess,
}: {
  doc: ProjectDocument;
  isExpanded: boolean;
  isReprocessing: boolean;
  onToggleExpand: () => void;
  onReprocess: () => void;
}) {
  const status = isReprocessing ? "processing" : getDocStatus(doc);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <StatusIcon className={`h-4 w-4 shrink-0 ${config.colorClass}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-200">
            {doc.document_label ?? doc.file_name ?? doc.document_type}
          </p>
          <p className="text-xs text-gray-500">
            {doc.document_type.replace(/_/g, " ")} · {config.label}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {doc.file_id && (
            <a
              href={`https://drive.google.com/file/d/${doc.file_id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1 text-gray-500 transition hover:bg-gray-800 hover:text-blue-400"
              title="View in Google Drive"
            >
              <EyeIcon className="h-3.5 w-3.5" />
              <span className="sr-only">View in Google Drive</span>
            </a>
          )}
          {(status === "stale" || status === "unprocessed") && (
            <button
              onClick={onReprocess}
              className="rounded p-1 text-gray-500 transition hover:bg-gray-800 hover:text-blue-400"
              title="Reprocess"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
            </button>
          )}

          {doc.extracted_text && (
            <button
              onClick={onToggleExpand}
              className="rounded p-1 text-gray-500 transition hover:bg-gray-800 hover:text-gray-300"
            >
              <ChevronDownIcon
                className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {isExpanded && doc.extracted_text && (
        <div className="border-t border-gray-800 px-3 py-2">
          <p className="max-h-32 overflow-y-auto text-xs leading-relaxed text-gray-400 whitespace-pre-wrap">
            {doc.extracted_text.substring(0, 1000)}
            {doc.extracted_text.length > 1000 && "..."}
          </p>
        </div>
      )}
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
