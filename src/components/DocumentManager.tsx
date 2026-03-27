"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

interface DocumentManagerProps {
  projectId: string;
}

export function DocumentManager({ projectId }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<ProjectDocument | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    documentType: "deed",
    documentLabel: "",
    fileId: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        if (selectedDoc?.id === payload.new.id) {
          setSelectedDoc(payload.new);
        }
      }

      if (payload.eventType === "DELETE" && payload.old) {
        setDocuments((prev) =>
          prev.filter((d) => d.id !== payload.old!.id),
        );
        if (selectedDoc?.id === payload.old.id) {
          setSelectedDoc(null);
        }
      }
    });

    return () => {
      void channel.unsubscribe();
    };
  }, [projectId, selectedDoc?.id]);

  const resetForm = () => {
    setAddForm({ documentType: "deed", documentLabel: "", fileId: "" });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowAddForm(false);
    setError(null);
  };

  const handleAdd = async () => {
    if (!addForm.documentType) return;
    if (!selectedFile && !addForm.fileId.trim()) {
      setError("Please select a file to upload or provide a Drive file ID");
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
      if (selectedDoc?.id === docId) setSelectedDoc(null);
    } catch (err) {
      console.error("Failed to delete document", err);
    }
  };

  const getTypeLabel = (type: string) =>
    DOCUMENT_TYPES.find((t) => t.value === type)?.label ?? type;

  const isProcessing = (doc: ProjectDocument) =>
    !doc.processedAt && (!!doc.fileId || reprocessingIds.has(doc.id));

  const hasError = (doc: ProjectDocument) =>
    !doc.processedAt &&
    doc.structuredData &&
    "processing_error" in doc.structuredData;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <div className={`flex-1 space-y-4 ${selectedDoc ? "max-w-2xl" : ""}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Project Documents
            </h2>
            <p className="text-sm text-gray-500">
              Upload documents to build project context for AI-assisted report
              generation.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              showAddForm ? resetForm() : setShowAddForm(true)
            }
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            {showAddForm ? "Cancel" : "Add Document"}
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {showAddForm && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Document Type
                </label>
                <select
                  value={addForm.documentType}
                  onChange={(e) =>
                    setAddForm((f) => ({
                      ...f,
                      documentType: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={addForm.documentLabel}
                  onChange={(e) =>
                    setAddForm((f) => ({
                      ...f,
                      documentLabel: e.target.value,
                    }))
                  }
                  placeholder="e.g., Deed Record - Instrument #2024-1234"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Upload File
              </label>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50">
                  <svg
                    className="h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  Choose file
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setSelectedFile(file);
                      if (file) setAddForm((f) => ({ ...f, fileId: "" }));
                    }}
                  />
                </label>
                {selectedFile && (
                  <span className="text-sm text-gray-600">
                    {selectedFile.name}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">
                  or provide a Drive file ID
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <input
                type="text"
                value={addForm.fileId}
                onChange={(e) => {
                  setAddForm((f) => ({ ...f, fileId: e.target.value }));
                  if (e.target.value.trim()) {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }
                }}
                placeholder="Paste Google Drive file ID"
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleAdd}
                disabled={
                  isAdding ||
                  !addForm.documentType ||
                  (!selectedFile && !addForm.fileId.trim())
                }
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
              >
                {isAdding ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Uploading...
                  </span>
                ) : (
                  "Add & Process"
                )}
              </button>
            </div>
          </div>
        )}

        {documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">
              No documents added yet. Upload documents like deed records, flood
              maps, and zoning maps to build project context.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`flex items-center justify-between rounded-lg border bg-white p-3 shadow-sm transition ${
                  selectedDoc?.id === doc.id
                    ? "border-blue-300 ring-1 ring-blue-200"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <button
                  type="button"
                  className="flex flex-1 items-center gap-3 text-left"
                  onClick={() =>
                    setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)
                  }
                >
                  <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {getTypeLabel(doc.documentType)}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {doc.documentLabel ?? doc.fileName ?? "Untitled"}
                  </span>
                  <DocumentStatusBadge
                    doc={doc}
                    isReprocessing={reprocessingIds.has(doc.id)}
                  />
                </button>

                <div className="ml-2 flex items-center gap-1">
                  {(doc.processedAt ?? hasError(doc)) && (
                    <button
                      type="button"
                      onClick={() => handleReprocess(doc.id)}
                      disabled={
                        isProcessing(doc) || reprocessingIds.has(doc.id)
                      }
                      className="rounded p-1 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Reprocess document"
                    >
                      <svg
                        className={`h-4 w-4 ${reprocessingIds.has(doc.id) ? "animate-spin" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
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
            ))}
          </div>
        )}
      </div>

      {selectedDoc && (
        <div className="w-96 shrink-0">
          <div className="sticky top-4 rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Document Details
              </h3>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="space-y-3 p-4">
              <DetailRow
                label="Type"
                value={getTypeLabel(selectedDoc.documentType)}
              />
              <DetailRow label="Label" value={selectedDoc.documentLabel} />
              <DetailRow label="File Name" value={selectedDoc.fileName} />
              <DetailRow label="File ID" value={selectedDoc.fileId} />
              <DetailRow
                label="Status"
                value={selectedDoc.processedAt ? "Processed" : "Pending"}
              />
              <DetailRow
                label="Processed"
                value={
                  selectedDoc.processedAt
                    ? new Date(selectedDoc.processedAt).toLocaleString()
                    : undefined
                }
              />
              <DetailRow
                label="Added"
                value={new Date(selectedDoc.createdAt).toLocaleDateString()}
              />

              {hasError(selectedDoc) && (
                <div className="rounded border border-red-200 bg-red-50 p-2">
                  <p className="text-xs font-medium text-red-700">
                    Processing Error
                  </p>
                  <p className="mt-0.5 text-xs text-red-600">
                    {String(
                      (
                        selectedDoc.structuredData as {
                          processing_error?: string;
                        }
                      ).processing_error ?? "Unknown error",
                    )}
                  </p>
                </div>
              )}

              {selectedDoc.extractedText && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">
                    Extracted Text
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-700 whitespace-pre-wrap">
                    {selectedDoc.extractedText}
                  </div>
                </div>
              )}

              {selectedDoc.structuredData &&
                !("processing_error" in selectedDoc.structuredData) &&
                Object.keys(selectedDoc.structuredData).length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">
                      Structured Data
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-2">
                      {Object.entries(selectedDoc.structuredData).map(
                        ([key, value]) => (
                          <div key={key} className="mb-1 text-xs">
                            <span className="font-medium text-gray-600">
                              {key}:
                            </span>{" "}
                            <span className="text-gray-700">
                              {String(value)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentStatusBadge({
  doc,
  isReprocessing,
}: {
  doc: ProjectDocument;
  isReprocessing: boolean;
}) {
  if (isReprocessing || (!doc.processedAt && doc.fileId)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border border-blue-600 border-t-transparent" />
        Processing...
      </span>
    );
  }

  if (
    !doc.processedAt &&
    doc.structuredData &&
    "processing_error" in doc.structuredData
  ) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
        Error
      </span>
    );
  }

  if (doc.processedAt) {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
        Processed
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
      No file
    </span>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}
