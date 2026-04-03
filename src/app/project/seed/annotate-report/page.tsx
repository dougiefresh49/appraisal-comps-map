"use client";

import { useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_FILES = [
  "6310 Tashaya Dr Odessa Report.md",
  "GCC Permian Land Report.md",
  "210 W 57th Odessa Report.md",
  "103 East Ave Kermit Appraisal Report.md",
  "360 SE Loop 338 Odessa Report.md",
  "600 W Louisiana Ave Report.md",
  "1604 S Burleson Ave McCamey Report.md",
  "Apprisal Report for 1227 S Murphy.md",
  "2508 N Big Spring St Report.md",
  "405 N Terrell St Report - corrected.md",
  "1409 Connell St Report.md",
] as const;

const PARENT_GROUP_LABELS: Record<string, string> = {
  cover: "Cover & Transmittal",
  definitions: "Definition of the Problem",
  "general-data": "General Data",
  "subject-analysis": "Subject Property Analysis",
  "valuation-land": "Sales Comparison – Land Value",
  "valuation-cost": "Cost Approach",
  "valuation-sales": "Sales Comparison – Improved",
  "valuation-income": "Income Capitalization Approach",
  reconciliation: "Reconciliation & Certification",
  addenda: "Addenda",
};

const PARENT_GROUP_ORDER = [
  "cover",
  "definitions",
  "general-data",
  "subject-analysis",
  "valuation-land",
  "valuation-cost",
  "valuation-sales",
  "valuation-income",
  "reconciliation",
  "addenda",
];

const CONTENT_TYPES = [
  "boilerplate",
  "standard-with-tweaks",
  "data-driven",
  "narrative",
  "analysis",
  "visual",
] as const;

type ContentType = (typeof CONTENT_TYPES)[number];

const CONTENT_TYPE_STYLES: Record<ContentType, string> = {
  boilerplate: "bg-gray-700 text-gray-300 hover:bg-gray-600",
  "standard-with-tweaks": "bg-blue-900 text-blue-300 hover:bg-blue-800",
  "data-driven": "bg-green-900 text-green-300 hover:bg-green-800",
  narrative: "bg-purple-900 text-purple-300 hover:bg-purple-800",
  analysis: "bg-amber-900 text-amber-300 hover:bg-amber-800",
  visual: "bg-cyan-900 text-cyan-300 hover:bg-cyan-800",
};

const PRIORITIES = ["critical", "important", "reference", "skip"] as const;
type Priority = (typeof PRIORITIES)[number];

const PRIORITY_STYLES: Record<Priority, string> = {
  critical: "bg-red-900 text-red-300 hover:bg-red-800",
  important: "bg-amber-900 text-amber-300 hover:bg-amber-800",
  reference: "bg-gray-700 text-gray-400 hover:bg-gray-600",
  skip: "bg-gray-800 text-gray-500 hover:bg-gray-700",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Annotation {
  id: string;
  project_id: string | null;
  source_filename: string | null;
  section_key: string;
  label: string;
  parent_group: string;
  content_type: string;
  extraction_priority: string;
  variability: string;
  ai_confidence: number | null;
  human_reviewed: boolean;
  notes: string | null;
  content_preview: string | null;
  start_line: number | null;
  end_line: number | null;
}

interface AnnotateResponse {
  message?: string;
  error?: string;
  annotations?: Annotation[];
  elapsed_ms?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cycleValue<T extends string>(current: string, options: readonly T[]): T {
  const idx = options.indexOf(current as T);
  return options[(idx + 1) % options.length]!;
}

function confidenceColor(confidence: number | null): string {
  if (confidence === null) return "text-gray-500";
  if (confidence >= 0.9) return "text-green-400";
  if (confidence >= 0.7) return "text-amber-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ContentTypeBadge({
  value,
  onClick,
}: {
  value: string;
  onClick: () => void;
}) {
  const style =
    CONTENT_TYPE_STYLES[value as ContentType] ??
    "bg-gray-700 text-gray-300 hover:bg-gray-600";
  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to cycle content type"
      className={`cursor-pointer rounded px-2 py-0.5 text-xs font-medium transition ${style}`}
    >
      {value}
    </button>
  );
}

function PriorityBadge({
  value,
  onClick,
}: {
  value: string;
  onClick: () => void;
}) {
  const style =
    PRIORITY_STYLES[value as Priority] ??
    "bg-gray-700 text-gray-400 hover:bg-gray-600";
  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to cycle extraction priority"
      className={`cursor-pointer rounded px-1.5 py-0.5 text-xs transition ${style}`}
    >
      {value}
    </button>
  );
}

function AnnotationRow({
  annotation,
  onUpdate,
}: {
  annotation: Annotation;
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`rounded border px-3 py-2.5 transition ${
        annotation.human_reviewed
          ? "border-gray-700 bg-gray-900/50"
          : "border-gray-700 bg-gray-900"
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Human reviewed checkbox */}
        <input
          type="checkbox"
          checked={annotation.human_reviewed}
          onChange={(e) =>
            onUpdate(annotation.id, { human_reviewed: e.target.checked })
          }
          title="Mark as human reviewed"
          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-blue-500"
        />

        <div className="min-w-0 flex-1">
          {/* Label + badges row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`text-sm font-medium ${
                annotation.human_reviewed ? "text-gray-400" : "text-gray-100"
              }`}
            >
              {annotation.label}
            </span>

            <ContentTypeBadge
              value={annotation.content_type}
              onClick={() =>
                onUpdate(annotation.id, {
                  content_type: cycleValue(annotation.content_type, CONTENT_TYPES),
                })
              }
            />

            <PriorityBadge
              value={annotation.extraction_priority}
              onClick={() =>
                onUpdate(annotation.id, {
                  extraction_priority: cycleValue(
                    annotation.extraction_priority,
                    PRIORITIES,
                  ),
                })
              }
            />

            {annotation.ai_confidence !== null && (
              <span
                className={`text-xs ${confidenceColor(annotation.ai_confidence)}`}
              >
                {Math.round(annotation.ai_confidence * 100)}%
              </span>
            )}

            <span className="text-xs text-gray-600">
              {annotation.section_key}
            </span>
          </div>

          {/* Content preview toggle */}
          {annotation.content_preview && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                {isExpanded ? "▲ hide preview" : "▼ show preview"}
              </button>
              {isExpanded && (
                <p className="mt-1 rounded bg-gray-800 px-2 py-1.5 text-xs leading-relaxed text-gray-400">
                  {annotation.content_preview}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Line range */}
        {annotation.start_line !== null && (
          <span className="flex-shrink-0 text-xs text-gray-600">
            L{annotation.start_line}
            {annotation.end_line !== null ? `–${annotation.end_line}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AnnotateReportPage() {
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // Group annotations by parent_group in canonical order
  const groupedAnnotations = PARENT_GROUP_ORDER.reduce<
    Record<string, Annotation[]>
  >((acc, group) => {
    const items = annotations.filter((a) => a.parent_group === group);
    if (items.length > 0) acc[group] = items;
    return acc;
  }, {});

  // Collect any annotations whose parent_group isn't in the canonical order
  const unknownGroupAnnotations = annotations.filter(
    (a) => !PARENT_GROUP_ORDER.includes(a.parent_group),
  );
  if (unknownGroupAnnotations.length > 0) {
    groupedAnnotations.unknown = unknownGroupAnnotations;
  }

  const handleAnnotate = async () => {
    if (!selectedFile) return;
    setIsAnnotating(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setAnnotations([]);
    setElapsedMs(null);

    try {
      const res = await fetch("/api/seed/annotate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          md_filename: selectedFile,
          project_id: projectId.trim() || undefined,
        }),
      });

      const data = (await res.json()) as AnnotateResponse;

      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? `HTTP ${res.status}`);
        return;
      }

      setAnnotations(data.annotations ?? []);
      setElapsedMs(data.elapsed_ms ?? null);
      setSuccessMsg(data.message ?? "Annotation complete");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsAnnotating(false);
    }
  };

  const handleUpdateAnnotation = async (
    id: string,
    updates: Partial<Annotation>,
  ) => {
    // Optimistic update
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    );

    try {
      const res = await fetch("/api/seed/annotate-report", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        console.error("[annotate-report] PATCH failed:", data.error);
      }
    } catch (err) {
      console.error("[annotate-report] PATCH error:", err);
    }
  };

  const handleMarkAllReviewed = async () => {
    if (!selectedFile || annotations.length === 0) return;
    setIsSavingAll(true);

    try {
      const res = await fetch("/api/seed/annotate-report", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_filename: selectedFile,
          project_id: projectId.trim() || undefined,
          bulk_mark_reviewed: true,
        }),
      });

      if (res.ok) {
        setAnnotations((prev) =>
          prev.map((a) => ({ ...a, human_reviewed: true })),
        );
        setSuccessMsg("All annotations marked as reviewed.");
      } else {
        const data = (await res.json()) as { error?: string };
        setErrorMsg(data.error ?? "Bulk update failed");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsSavingAll(false);
    }
  };

  const reviewedCount = annotations.filter((a) => a.human_reviewed).length;
  const totalCount = annotations.length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/project/seed"
            className="text-sm text-gray-500 transition hover:text-gray-300"
          >
            ← Seed Tools
          </Link>
          <span className="text-gray-700">/</span>
          <h1 className="text-xl font-bold text-gray-100">
            Report Section Annotator
          </h1>
        </div>

        <p className="mb-6 text-sm text-gray-500">
          Sends a past report markdown to Gemini 3.1 Pro with the section
          taxonomy to auto-classify each section. Review and override AI
          classifications before storing to{" "}
          <code className="rounded bg-gray-800 px-1 py-0.5 text-xs text-gray-400">
            report_section_annotations
          </code>
          .
        </p>

        {/* Controls */}
        <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-5">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="file-select"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Report file
              </label>
              <select
                id="file-select"
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                disabled={isAnnotating}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">— select a report —</option>
                {REPORT_FILES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="project-id"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Project ID{" "}
                <span className="font-normal text-gray-500">
                  (optional — links annotations to a project)
                </span>
              </label>
              <input
                id="project-id"
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={isAnnotating}
                placeholder="uuid from projects table"
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleAnnotate()}
                disabled={!selectedFile || isAnnotating}
                className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-900 disabled:text-blue-400"
              >
                {isAnnotating ? "Annotating with Gemini…" : "Annotate Report"}
              </button>

              {isAnnotating && (
                <span className="text-xs text-gray-500">
                  This may take 30–90 seconds for large reports…
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
            <strong>Error:</strong> {errorMsg}
          </div>
        )}
        {successMsg && !errorMsg && (
          <div className="mb-4 rounded-md border border-green-800 bg-green-950 px-4 py-3 text-sm text-green-300">
            {successMsg}
            {elapsedMs !== null && (
              <span className="ml-2 text-green-500">
                ({(elapsedMs / 1000).toFixed(1)}s)
              </span>
            )}
          </div>
        )}

        {/* Results */}
        {annotations.length > 0 && (
          <>
            {/* Stats bar */}
            <div className="mb-4 flex items-center justify-between rounded-md border border-gray-800 bg-gray-900 px-4 py-2.5">
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <span>
                  <span className="font-medium text-gray-100">{totalCount}</span>{" "}
                  sections annotated
                </span>
                <span>
                  <span className="font-medium text-gray-100">
                    {reviewedCount}
                  </span>{" "}
                  / {totalCount} reviewed
                </span>
                <span>
                  {Object.keys(groupedAnnotations).length} groups
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleMarkAllReviewed()}
                disabled={isSavingAll || reviewedCount === totalCount}
                className="rounded-md bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSavingAll ? "Saving…" : "Mark all reviewed"}
              </button>
            </div>

            {/* Legend */}
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-gray-800 bg-gray-900 px-4 py-3">
              <span className="text-xs font-medium text-gray-500">
                Content type:
              </span>
              {CONTENT_TYPES.map((ct) => (
                <span
                  key={ct}
                  className={`rounded px-1.5 py-0.5 text-xs ${CONTENT_TYPE_STYLES[ct]}`}
                >
                  {ct}
                </span>
              ))}
              <span className="ml-3 text-xs font-medium text-gray-500">
                Priority:
              </span>
              {PRIORITIES.map((p) => (
                <span
                  key={p}
                  className={`rounded px-1.5 py-0.5 text-xs ${PRIORITY_STYLES[p]}`}
                >
                  {p}
                </span>
              ))}
              <span className="ml-2 text-xs text-gray-600">
                — click badges to cycle
              </span>
            </div>

            {/* Grouped annotations */}
            <div className="space-y-6">
              {Object.entries(groupedAnnotations).map(([group, items]) => (
                <div key={group}>
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                      {PARENT_GROUP_LABELS[group] ?? group}
                    </h2>
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-500">
                      {items.length}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {items.map((annotation) => (
                      <AnnotationRow
                        key={annotation.id}
                        annotation={annotation}
                        onUpdate={handleUpdateAnnotation}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom save button */}
            <div className="mt-8 flex justify-end border-t border-gray-800 pt-4">
              <button
                type="button"
                onClick={() => void handleMarkAllReviewed()}
                disabled={isSavingAll || reviewedCount === totalCount}
                className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-900 disabled:text-blue-400"
              >
                {isSavingAll
                  ? "Saving…"
                  : reviewedCount === totalCount
                    ? "All reviewed ✓"
                    : `Mark all ${totalCount} sections reviewed`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
