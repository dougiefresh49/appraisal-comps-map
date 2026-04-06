"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";
import { useSubjectData } from "~/hooks/useSubjectData";
import { createClient } from "~/utils/supabase/client";
import type { CompParsedDataRow } from "~/types/comp-data";
import {
  buildOutputData,
  defaultSelectedSections,
  contextToCompType,
  exportFileName,
  EXPORT_SECTION_LABELS,
  EXPORT_SECTION_ORDER,
  type ExportSection,
} from "~/lib/export-builder";

interface ExportJsonDialogProps {
  projectId: string;
  context: "subject" | "land" | "sales" | "rentals";
  isOpen: boolean;
  onClose: () => void;
}

export function ExportJsonDialog({
  projectId,
  context,
  isOpen,
  onClose,
}: ExportJsonDialogProps) {
  const { project } = useProject(projectId);
  const { subjectData } = useSubjectData(projectId);

  const [selectedSections, setSelectedSections] = useState<Set<ExportSection>>(
    () => defaultSelectedSections(context),
  );
  const [compParsedDataRows, setCompParsedDataRows] = useState<
    CompParsedDataRow[]
  >([]);
  const [isLoadingComps, setIsLoadingComps] = useState(false);

  const [generatedJson, setGeneratedJson] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [savingStatus, setSavingStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  const compType = contextToCompType(context);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedSections(defaultSelectedSections(context));
      setGeneratedJson(null);
      setIsPreviewOpen(false);
      setCopied(false);
      setSavingStatus("idle");
      setSaveError(null);
      setSavedFileName(null);
    }
  }, [isOpen, context]);

  // Fetch comp parsed data when dialog opens for comp contexts
  useEffect(() => {
    if (!isOpen || !compType || !project) return;

    const compIds = project.comparables
      .filter((c) => c.type === compType)
      .map((c) => c.id);

    if (compIds.length === 0) {
      setCompParsedDataRows([]);
      return;
    }

    let cancelled = false;
    setIsLoadingComps(true);

    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("comp_parsed_data")
          .select("*")
          .in("comp_id", compIds);

        if (!cancelled) {
          if (error) throw error;
          setCompParsedDataRows((data ?? []) as CompParsedDataRow[]);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[ExportJsonDialog] Failed to load comp data:", err);
          setCompParsedDataRows([]);
        }
      } finally {
        if (!cancelled) setIsLoadingComps(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, compType, project]);

  const toggleSection = useCallback((section: ExportSection) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
    // Clear generated output when selection changes
    setGeneratedJson(null);
    setIsPreviewOpen(false);
  }, []);

  const handleGenerate = useCallback(() => {
    const output = buildOutputData({
      subjectDataRow: subjectData,
      compParsedDataRows,
      selectedSections,
      compType,
    });
    setGeneratedJson(JSON.stringify(output, null, 2));
    setIsPreviewOpen(true);
  }, [subjectData, compParsedDataRows, selectedSections, compType]);

  const handleCopy = useCallback(async () => {
    if (!generatedJson) return;
    try {
      await navigator.clipboard.writeText(generatedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
    }
  }, [generatedJson]);

  const handleSaveToDrive = useCallback(async () => {
    if (!generatedJson) return;
    setSavingStatus("saving");
    setSaveError(null);
    const fileName = exportFileName();
    try {
      const res = await fetch("/api/export/output-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, jsonContent: generatedJson, fileName }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        fileName?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSavingStatus("success");
      setSavedFileName(data.fileName ?? fileName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save to Drive";
      setSaveError(msg);
      setSavingStatus("error");
    }
  }, [generatedJson, projectId]);

  if (!isOpen) return null;

  const compCount =
    compType && project
      ? project.comparables.filter((c) => c.type === compType).length
      : 0;

  const parsedCount = compParsedDataRows.length;

  const contextLabel =
    context === "subject"
      ? "subject data"
      : `${compCount} ${context} comp${compCount !== 1 ? "s" : ""} (${parsedCount} with parsed data)`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">
              Export JSON for Importer
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Fallback export for the AppScript JSON importer —{" "}
              <span className="text-gray-400">{contextLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:text-gray-300"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Section selection */}
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
            Include in export
          </p>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_SECTION_ORDER.map((section) => {
              const checked = selectedSections.has(section);
              return (
                <label
                  key={section}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                    checked
                      ? "border-blue-700/60 bg-blue-950/30 text-blue-200"
                      : "border-gray-800 bg-gray-800/40 text-gray-400 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSection(section)}
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-blue-500"
                  />
                  <span className="text-xs leading-tight">
                    {EXPORT_SECTION_LABELS[section]}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Parcel context note */}
          {(selectedSections.has("parcelData") ||
            selectedSections.has("parcelImprovements")) && (
            <p className="mt-2 text-xs text-gray-600">
              Parcel data includes entries for each selected data source (subject
              and/or comp type).
            </p>
          )}

          {/* Loading state for comp data */}
          {isLoadingComps && (
            <p className="mt-3 text-xs text-gray-500">
              Loading comp parsed data…
            </p>
          )}

          {/* Generate button */}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={selectedSections.size === 0 || isLoadingComps}
              className="w-full rounded-lg border border-blue-700/50 bg-blue-900/30 px-4 py-2.5 text-sm font-medium text-blue-300 transition hover:border-blue-600 hover:bg-blue-900/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generatedJson ? "Re-generate Preview" : "Generate Preview"}
            </button>
          </div>

          {/* JSON Preview */}
          {generatedJson && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setIsPreviewOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-t-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200"
              >
                <span>JSON Preview</span>
                {isPreviewOpen ? (
                  <ChevronUpIcon className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                )}
              </button>
              {isPreviewOpen && (
                <pre className="max-h-72 overflow-y-auto rounded-b-lg border border-t-0 border-gray-700 bg-gray-950 px-3 py-3 font-mono text-xs leading-relaxed text-green-300">
                  {generatedJson}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-5 py-3">
          {/* Save status feedback */}
          {savingStatus === "success" && savedFileName && (
            <p className="mb-2 text-xs text-emerald-400">
              ✓ Saved to Drive: reports/data/{savedFileName}
            </p>
          )}
          {savingStatus === "error" && saveError && (
            <p className="mb-2 truncate text-xs text-red-400" title={saveError}>
              ✗ {saveError}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
            >
              Close
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!generatedJson}
                title="Copy JSON to clipboard"
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800/80 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-gray-600 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {copied ? (
                  <>
                    <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                    Copy JSON
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => void handleSaveToDrive()}
                disabled={!generatedJson || savingStatus === "saving"}
                title="Save JSON file to Google Drive (reports/data/)"
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700/60 bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-600 hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowDownTrayIcon className="h-3.5 w-3.5 flex-shrink-0" />
                {savingStatus === "saving" ? "Saving…" : "Save to Drive"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
