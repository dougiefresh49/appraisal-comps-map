"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
  forwardRef,
} from "react";
import type { Ref } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFERENCE_PROJECTS: { file: string; projectName: string }[] = [
  { file: "6310 Tashaya Dr Odessa Report.md", projectName: "6310 Tashaya Dr Odessa" },
  { file: "GCC Permian Land Report.md", projectName: "GCC Permian Land" },
  { file: "210 W 57th Odessa Report.md", projectName: "210 W 57th Odessa" },
  { file: "103 East Ave Kermit Appraisal Report.md", projectName: "103 East Ave Kermit" },
  { file: "360 SE Loop 338 Odessa Report.md", projectName: "360 SE Loop 338 Odessa" },
  { file: "600 W Louisiana Ave Report.md", projectName: "600 W Louisiana Ave" },
  { file: "1604 S Burleson Ave McCamey Report.md", projectName: "1604 S Burleson Ave McCamey" },
  { file: "Apprisal Report for 1227 S Murphy.md", projectName: "1227 S Murphy" },
  { file: "2508 N Big Spring St Report.md", projectName: "2508 N Big Spring St" },
  { file: "405 N Terrell St Report - corrected.md", projectName: "405 N Terrell St" },
  { file: "1409 Connell St Report.md", projectName: "1409 Connell St" },
];

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

const CONTENT_TYPE_DEFINITIONS: Record<ContentType, string> = {
  boilerplate:
    "Identical or near-identical across all reports. Legal definitions, standard disclaimers, certification language. No extraction value — skip these.",
  "standard-with-tweaks":
    "Mostly templated text where a few fields change per report (client name, dates, address, value amount). The template is always the same but certain data points are swapped in. May contain dynamic data but the prose around it doesn't change.",
  "data-driven":
    "Content generated directly from structured data — tables, charts, schedules, tax breakdowns. The text wrapping the data may be templated, but the core value is the structured numbers/facts.",
  narrative:
    "Appraiser-written prose that varies significantly between reports based on the property and market. High extraction value for learning writing style and typical content.",
  analysis:
    "Combines data and reasoning — adjustments, reconciliation, value conclusions with supporting logic. The most valuable sections for learning adjustment patterns and methodology.",
  visual:
    "Maps, photos, sketches, flood maps — image-primary content. No text extraction value.",
};

const PRIORITY_DEFINITIONS: Record<Priority, string> = {
  critical:
    "Must be extracted and stored for every report. Core data (subject details, comp data, adjustment charts, summary tables, reconciliation). Directly feeds the spreadsheet and report generation.",
  important:
    "Valuable narrative and analysis content. Used for RAG context, writing style learning, and methodology examples. Extract when possible.",
  reference:
    "Supporting context (flood maps, utilities, scope of work). Useful for completeness but not essential for report generation. Extract opportunistically.",
  skip:
    "No extraction value — boilerplate legal text, photos, qualifications, E&O insurance. Ignore during ingestion.",
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

type LoadBanner =
  | { variant: "loading"; text: string }
  | { variant: "success"; text: string }
  | { variant: "neutral"; text: string };

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

function getContentTypeDefinition(value: string): string {
  return (
    (CONTENT_TYPE_DEFINITIONS as Record<string, string>)[value] ??
    "How this section’s text is structured relative to other reports."
  );
}

function getPriorityDefinition(value: string): string {
  return (
    (PRIORITY_DEFINITIONS as Record<string, string>)[value] ??
    "How important this section is for extraction and downstream use."
  );
}

function normalizeHighlightRange(
  start: number,
  end: number | null,
): { lo: number; hi: number } {
  const hi = end ?? start;
  return start <= hi ? { lo: start, hi } : { lo: hi, hi: start };
}

/** 1-based line → byte offset at start of that line */
function charOffsetForLine1(markdown: string, line1: number): number {
  if (line1 <= 1) return 0;
  let seen = 1;
  for (let i = 0; i < markdown.length; i++) {
    if (markdown[i] === "\n") {
      seen++;
      if (seen === line1) return i + 1;
    }
  }
  return markdown.length;
}

function buildPreviewNeedles(preview: string): string[] {
  const t = preview.trim();
  if (!t) return [];
  const out: string[] = [];
  for (const len of [200, 150, 120, 90, 60]) {
    if (t.length >= 24) out.push(t.slice(0, len));
  }
  const firstLine = t.split("\n")[0]?.trim() ?? "";
  if (firstLine.length >= 32) out.push(firstLine);
  const words = t
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 14)
    .join(" ");
  if (words.length >= 28) out.push(words);
  return [...new Set(out.filter((n) => n.length >= 20))];
}

/**
 * Find where `preview` occurs in stripped markdown so highlights match the
 * preview text (Gemini line numbers are often wrong). Prefer a match near
 * `nearLineHint` when duplicates exist.
 */
function resolvePreviewToLineRange(
  markdown: string,
  preview: string | null,
  nearLineHint: number | null,
  aiStart: number | null,
  aiEnd: number | null,
): { start: number; end: number } | null {
  const lines = markdown.split("\n");
  const total = lines.length;
  if (total === 0) return null;

  const fallbackFromAi = (): { start: number; end: number } | null => {
    if (aiStart == null) return null;
    const { lo, hi } = normalizeHighlightRange(aiStart, aiEnd);
    return {
      start: Math.max(1, Math.min(lo, total)),
      end: Math.max(1, Math.min(hi, total)),
    };
  };

  const needles = preview ? buildPreviewNeedles(preview) : [];
  const tryInSlice = (slice: string, globalFrom: number): number => {
    for (const n of needles) {
      let i = slice.indexOf(n);
      if (i === -1) {
        i = slice.toLowerCase().indexOf(n.toLowerCase());
      }
      if (i !== -1) return globalFrom + i;
    }
    return -1;
  };

  let matchIdx = -1;
  const windowChars = 16000;
  const hint = nearLineHint ?? aiStart;
  if (needles.length > 0 && hint != null && hint > 0) {
    const center = charOffsetForLine1(markdown, Math.min(hint, total));
    const from = Math.max(0, center - windowChars);
    const to = Math.min(markdown.length, center + windowChars);
    matchIdx = tryInSlice(markdown.slice(from, to), from);
  }
  if (matchIdx === -1 && needles.length > 0) {
    matchIdx = tryInSlice(markdown, 0);
  }

  if (matchIdx === -1) {
    return fallbackFromAi();
  }

  const startLine = markdown.slice(0, matchIdx).split("\n").length;

  const scanFrom = matchIdx + Math.min(preview?.trim().length ?? 200, 400);
  const tail = markdown.slice(scanFrom);
  const nextHeading = /\n#{1,6}[ \t]/m.exec(tail);
  let endLine: number;
  if (nextHeading?.index != null) {
    const endChar = scanFrom + nextHeading.index;
    endLine = markdown.slice(0, endChar).split("\n").length;
  } else {
    const nPreviewLines = (preview?.trim().split("\n").length ?? 1) + 10;
    endLine = Math.min(total, startLine + Math.max(nPreviewLines, 15));
  }

  return {
    start: Math.max(1, Math.min(startLine, total)),
    end: Math.max(startLine, Math.min(endLine, total)),
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DefinitionLegendPill({
  label,
  definition,
  styleClass,
}: {
  label: string;
  definition: string;
  styleClass: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded px-2 py-1 text-xs font-medium transition sm:px-1.5 sm:py-0.5 ${styleClass}`}
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute left-1/2 top-full z-40 mt-1 w-[min(calc(100vw-1.5rem),22rem)] -translate-x-1/2 rounded border border-gray-700 bg-gray-800 p-3 text-left shadow-xl sm:left-0 sm:w-80 sm:translate-x-0"
          role="tooltip"
        >
          <p className="text-sm leading-relaxed text-gray-200">{definition}</p>
        </div>
      )}
    </div>
  );
}

const ContentTypeBadge = forwardRef(function ContentTypeBadge(
  {
    value,
    onClick,
    onFocus,
  }: {
    value: string;
    onClick: () => void;
    onFocus?: () => void;
  },
  ref: Ref<HTMLButtonElement>,
) {
  const style =
    CONTENT_TYPE_STYLES[value as ContentType] ??
    "bg-gray-700 text-gray-300 hover:bg-gray-600";
  const def = getContentTypeDefinition(value);
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={0}
      onClick={onClick}
      onFocus={onFocus}
      title={`${def}\n\n— Click to cycle type`}
      className={`inline-flex min-h-[32px] cursor-pointer items-center rounded px-3 py-1.5 text-base font-medium transition sm:min-h-0 sm:px-2 sm:py-0.5 sm:text-xs ${style}`}
    >
      {value}
    </button>
  );
});

const PriorityBadge = forwardRef(function PriorityBadge(
  {
    value,
    onClick,
  }: {
    value: string;
    onClick: () => void;
  },
  ref: Ref<HTMLButtonElement>,
) {
  const style =
    PRIORITY_STYLES[value as Priority] ??
    "bg-gray-700 text-gray-400 hover:bg-gray-600";
  const def = getPriorityDefinition(value);
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={0}
      onClick={onClick}
      title={`${def}\n\n— Click to cycle priority`}
      className={`inline-flex min-h-[32px] cursor-pointer items-center rounded px-3 py-1.5 text-base transition sm:min-h-0 sm:px-1.5 sm:py-0.5 sm:text-xs ${style}`}
    >
      {value}
    </button>
  );
});

ContentTypeBadge.displayName = "ContentTypeBadge";
PriorityBadge.displayName = "PriorityBadge";

function AnnotationRow({
  annotation,
  onUpdate,
  onOpenSource,
  sourceFocusAnnotationId,
  resolvedRange,
  setContentTypeRef,
  setReviewedCheckboxRef,
  onContentTypeFocus,
  onReviewedAdvance,
}: {
  annotation: Annotation;
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
  onOpenSource?: (annotation: Annotation) => void;
  sourceFocusAnnotationId?: string | null;
  resolvedRange: { start: number; end: number } | null;
  setContentTypeRef?: (id: string, el: HTMLButtonElement | null) => void;
  setReviewedCheckboxRef?: (id: string, el: HTMLInputElement | null) => void;
  onContentTypeFocus?: (annotation: Annotation) => void;
  onReviewedAdvance?: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const lineRangeActive =
    sourceFocusAnnotationId != null &&
    sourceFocusAnnotationId === annotation.id;

  const displayRange: { start: number; end: number } | null =
    resolvedRange ??
    (annotation.start_line != null
      ? (() => {
          const { lo, hi } = normalizeHighlightRange(
            annotation.start_line,
            annotation.end_line,
          );
          return { start: lo, end: hi };
        })()
      : null);

  const lineRangeLabel =
    displayRange != null ? (
      <>
        L{displayRange.start}
        {displayRange.end !== displayRange.start ? `–${displayRange.end}` : ""}
      </>
    ) : null;

  const lineRangeClass = lineRangeActive
    ? "text-blue-400 hover:text-blue-300"
    : "text-gray-600 hover:text-gray-400";

  const lineRangeButton =
    lineRangeLabel !== null && onOpenSource ? (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onOpenSource(annotation)}
        className={`rounded px-1 py-0.5 text-left text-xs underline decoration-dotted underline-offset-2 transition ${lineRangeClass}`}
      >
        {lineRangeLabel}
      </button>
    ) : lineRangeLabel !== null ? (
      <span className="text-xs text-gray-600">{lineRangeLabel}</span>
    ) : null;

  return (
    <div
      className={`rounded border px-3 py-2.5 transition ${
        annotation.human_reviewed
          ? "border-gray-700 bg-gray-900/50"
          : "border-gray-700 bg-gray-900"
      }`}
    >
      {/* DOM / tab order: reviewed checkbox → content-type → priority (line/preview tabbable -1).
          On sm+: visual order [checkbox | content | line] via flex order. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2">
        <label className="flex min-h-[32px] min-w-[32px] shrink-0 cursor-pointer items-center justify-center sm:order-1 sm:mt-0.5 sm:min-h-0 sm:min-w-0 sm:justify-start">
          <input
            ref={(el) => setReviewedCheckboxRef?.(annotation.id, el)}
            type="checkbox"
            tabIndex={0}
            checked={annotation.human_reviewed}
            onChange={(e) => {
              const checked = e.target.checked;
              onUpdate(annotation.id, { human_reviewed: checked });
              if (checked) {
                onReviewedAdvance?.(annotation.id);
              }
            }}
            title="Mark as human reviewed (Space). Focus moves to the next row's checkbox when checked."
            className="h-4 w-4 cursor-pointer accent-blue-500 sm:h-3.5 sm:w-3.5"
          />
        </label>

        <div className="min-w-0 flex-1 sm:order-2">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
            <span
              className={`text-base font-medium sm:text-sm ${
                annotation.human_reviewed ? "text-gray-400" : "text-gray-100"
              }`}
            >
              {annotation.label}
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              <ContentTypeBadge
                ref={(el) => setContentTypeRef?.(annotation.id, el)}
                value={annotation.content_type}
                onFocus={() => onContentTypeFocus?.(annotation)}
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
                  className={`text-base sm:text-xs ${confidenceColor(annotation.ai_confidence)}`}
                >
                  {Math.round(annotation.ai_confidence * 100)}%
                </span>
              )}

              <span className="hidden text-xs text-gray-600 sm:inline">
                {annotation.section_key}
              </span>
            </div>
          </div>

          <span className="mt-1 block text-xs text-gray-600 sm:hidden">
            {annotation.section_key}
          </span>

          {lineRangeButton !== null && (
            <span className="mt-1 block sm:hidden">{lineRangeButton}</span>
          )}

          {annotation.content_preview && (
            <div className="mt-1">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setIsExpanded((v) => !v)}
                className="text-base text-gray-500 hover:text-gray-300 sm:text-xs"
              >
                {isExpanded ? "▲ hide preview" : "▼ show preview"}
              </button>
              {isExpanded && (
                <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-gray-800 px-2 py-1.5 text-base leading-relaxed text-gray-400 sm:text-xs">
                  {annotation.content_preview}
                </p>
              )}
            </div>
          )}
        </div>

        {lineRangeButton !== null && (
          <span className="hidden shrink-0 sm:order-3 sm:block">{lineRangeButton}</span>
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
  const [projectIdMap, setProjectIdMap] = useState<Record<string, string>>({});
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [loadBanner, setLoadBanner] = useState<LoadBanner | null>(null);

  const [sourceMarkdown, setSourceMarkdown] = useState<string | null>(null);
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceHighlight, setSourceHighlight] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [sourceFocusAnnotationId, setSourceFocusAnnotationId] = useState<
    string | null
  >(null);

  const sourceLines = useMemo(
    () => (sourceMarkdown ?? "").split("\n"),
    [sourceMarkdown],
  );

  const loadProjectIds = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
      );
      const names = REFERENCE_PROJECTS.map((r) => r.projectName);
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .eq("is_reference", true)
        .in("name", names);

      if (data) {
        const map: Record<string, string> = {};
        for (const row of data) {
          const entry = REFERENCE_PROJECTS.find((r) => r.projectName === row.name);
          if (entry) map[entry.file] = row.id as string;
        }
        setProjectIdMap(map);
      }
    } catch (err) {
      console.error("[annotate-report] Failed to load project IDs:", err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void loadProjectIds();
  }, [loadProjectIds]);

  useEffect(() => {
    if (selectedFile && projectIdMap[selectedFile]) {
      setProjectId(projectIdMap[selectedFile]);
    } else if (selectedFile) {
      setProjectId("");
    }
  }, [selectedFile, projectIdMap]);

  useEffect(() => {
    if (!selectedFile) {
      setAnnotations([]);
      setLoadBanner(null);
      setSuccessMsg(null);
      setElapsedMs(null);
      return;
    }

    setSuccessMsg(null);
    setElapsedMs(null);

    if (isLoadingProjects) {
      setAnnotations([]);
      setLoadBanner({
        variant: "loading",
        text: "Loading project link…",
      });
      return;
    }

    const controller = new AbortController();
    const pid = projectIdMap[selectedFile]?.trim() ?? "";

    async function loadExisting() {
      setErrorMsg(null);
      setLoadBanner({
        variant: "loading",
        text: "Loading saved annotations…",
      });

      try {
        const qs = pid
          ? `project_id=${encodeURIComponent(pid)}`
          : `source_filename=${encodeURIComponent(selectedFile)}`;
        const res = await fetch(`/api/seed/annotate-report?${qs}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as AnnotateResponse;

        if (!res.ok || data.error) {
          setLoadBanner(null);
          setAnnotations([]);
          setErrorMsg(data.error ?? `HTTP ${res.status}`);
          return;
        }

        const list = data.annotations ?? [];
        setAnnotations(list);

        if (list.length > 0) {
          setLoadBanner({
            variant: "success",
            text:
              data.message ??
              `Loaded ${list.length} existing annotations`,
          });
        } else {
          setLoadBanner({
            variant: "neutral",
            text: "No existing annotations — click Annotate to generate",
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setLoadBanner(null);
        setAnnotations([]);
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to load annotations",
        );
      }
    }

    void loadExisting();
    return () => controller.abort();
  }, [selectedFile, isLoadingProjects, projectIdMap]);

  useEffect(() => {
    if (!selectedFile) {
      setSourceMarkdown(null);
      setSourceError(null);
      setIsSourceLoading(false);
      setSourceHighlight(null);
      setSourceFocusAnnotationId(null);
      return;
    }

    const controller = new AbortController();
    setIsSourceLoading(true);
    setSourceError(null);
    setSourceMarkdown(null);

    async function loadSource() {
      try {
        const res = await fetch(
          `/api/seed/annotate-report/source?filename=${encodeURIComponent(
            selectedFile,
          )}`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as {
          content?: string;
          line_count?: number;
          error?: string;
        };

        if (!res.ok || data.error) {
          setSourceError(data.error ?? `HTTP ${res.status}`);
          setSourceMarkdown(null);
          return;
        }

        const body = data.content ?? "";
        setSourceMarkdown(body);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setSourceError(
          err instanceof Error ? err.message : "Failed to load source",
        );
        setSourceMarkdown(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsSourceLoading(false);
        }
      }
    }

    void loadSource();
    return () => controller.abort();
  }, [selectedFile]);

  useLayoutEffect(() => {
    if (!sourceHighlight || isSourceLoading || sourceMarkdown == null) {
      return;
    }
    const el = document.getElementById(`source-line-${sourceHighlight.start}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [
    sourceHighlight,
    isSourceLoading,
    sourceMarkdown,
    sourceLines.length,
  ]);

  const resolvedLineRanges = useMemo(() => {
    const md = sourceMarkdown;
    if (!md) {
      return new Map<string, { start: number; end: number }>();
    }
    const m = new Map<string, { start: number; end: number }>();
    for (const a of annotations) {
      const r = resolvePreviewToLineRange(
        md,
        a.content_preview,
        a.start_line,
        a.start_line,
        a.end_line,
      );
      if (r) m.set(a.id, r);
    }
    return m;
  }, [sourceMarkdown, annotations]);

  const handleOpenSource = useCallback(
    (annotation: Annotation) => {
      const md = sourceMarkdown;
      if (!md) return;
      const r =
        resolvedLineRanges.get(annotation.id) ??
        resolvePreviewToLineRange(
          md,
          annotation.content_preview,
          annotation.start_line,
          annotation.start_line,
          annotation.end_line,
        );
      if (!r) return;
      setSourceFocusAnnotationId(annotation.id);
      setSourceHighlight(r);
    },
    [sourceMarkdown, resolvedLineRanges],
  );

  const clearSourceHighlight = useCallback(() => {
    setSourceHighlight(null);
    setSourceFocusAnnotationId(null);
  }, []);

  const orderedAnnotations = useMemo(() => {
    const byGroup: Record<string, Annotation[]> = {};
    for (const a of annotations) {
      const key = PARENT_GROUP_ORDER.includes(a.parent_group)
        ? a.parent_group
        : "unknown";
      (byGroup[key] ??= []).push(a);
    }
    const out: Annotation[] = [];
    for (const key of PARENT_GROUP_ORDER) {
      const items = byGroup[key];
      if (items) out.push(...items);
    }
    const unknowns = byGroup.unknown;
    if (unknowns) out.push(...unknowns);
    return out;
  }, [annotations]);

  const contentTypeButtonRefs = useRef(
    new Map<string, HTMLButtonElement>(),
  );

  const reviewedCheckboxRefs = useRef(
    new Map<string, HTMLInputElement>(),
  );

  const setContentTypeRef = useCallback(
    (id: string, el: HTMLButtonElement | null) => {
      if (el) contentTypeButtonRefs.current.set(id, el);
      else contentTypeButtonRefs.current.delete(id);
    },
    [],
  );

  const setReviewedCheckboxRef = useCallback(
    (id: string, el: HTMLInputElement | null) => {
      if (el) reviewedCheckboxRefs.current.set(id, el);
      else reviewedCheckboxRefs.current.delete(id);
    },
    [],
  );

  const handleContentTypeFocus = useCallback(
    (a: Annotation) => {
      handleOpenSource(a);
    },
    [handleOpenSource],
  );

  const handleReviewedAdvance = useCallback(
    (id: string) => {
      const idx = orderedAnnotations.findIndex((x) => x.id === id);
      const next = orderedAnnotations[idx + 1];
      if (!next) return;
      handleOpenSource(next);
      requestAnimationFrame(() => {
        reviewedCheckboxRefs.current.get(next.id)?.focus();
      });
    },
    [orderedAnnotations, handleOpenSource],
  );

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

    if (annotations.length > 0) {
      const ok = window.confirm(
        "Re-run AI annotation? This replaces all saved annotations for this report with new Gemini results.",
      );
      if (!ok) return;
    }

    setIsAnnotating(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadBanner(null);
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
    <div className="min-h-screen overflow-x-hidden bg-gray-950 text-gray-100">
      <div
        className={`mx-auto flex w-full flex-col px-3 py-4 sm:px-4 sm:py-8 xl:flex-row xl:items-stretch xl:gap-0 xl:px-0 xl:py-0 ${
          selectedFile ? "xl:max-w-[100rem]" : "max-w-4xl"
        }`}
      >
        <div
          className={`min-w-0 flex-1 xl:max-h-screen xl:overflow-y-auto xl:px-6 xl:py-8 ${
            selectedFile ? "xl:w-1/2 xl:shrink-0" : ""
          }`}
        >
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
        <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-4 sm:p-5">
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
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-base text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-50 sm:text-sm"
              >
                <option value="">— select a report —</option>
                {REFERENCE_PROJECTS.map((r) => (
                  <option key={r.file} value={r.file}>
                    {r.projectName}
                    {projectIdMap[r.file] ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedFile && (
              <div className="flex items-center gap-2 text-xs">
                {isLoadingProjects ? (
                  <span className="text-gray-500">Loading project IDs…</span>
                ) : projectId ? (
                  <span className="text-gray-500">
                    Project ID:{" "}
                    <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-400">
                      {projectId}
                    </code>
                  </span>
                ) : (
                  <span className="text-amber-500">
                    No matching reference project found in DB — annotations will be file-only
                  </span>
                )}
              </div>
            )}

            {loadBanner && (
              <p
                className={
                  loadBanner.variant === "loading"
                    ? "text-base text-gray-500 sm:text-sm"
                    : loadBanner.variant === "success"
                      ? "text-base text-green-400 sm:text-sm"
                      : "text-base text-gray-500 sm:text-sm"
                }
              >
                {loadBanner.text}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={() => void handleAnnotate()}
                disabled={!selectedFile || isAnnotating}
                className="w-full rounded-md bg-blue-600 px-5 py-2.5 text-base font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-900 disabled:text-blue-400 sm:w-auto sm:py-2 sm:text-sm"
              >
                {isAnnotating
                  ? "Annotating with Gemini…"
                  : annotations.length > 0
                    ? "Re-annotate with AI"
                    : "Annotate Report"}
              </button>

              {isAnnotating && (
                <span className="text-base text-gray-500 sm:text-xs">
                  This may take ~2 minutes for large reports…
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
            <div className="mb-4 flex flex-col gap-3 rounded-md border border-gray-800 bg-gray-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
              <div className="flex flex-col gap-1 text-base text-gray-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:text-sm">
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
                className="w-full rounded-md bg-gray-700 px-3 py-2.5 text-base font-medium text-gray-200 transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-1.5 sm:text-xs"
              >
                {isSavingAll ? "Saving…" : "Mark all reviewed"}
              </button>
            </div>

            {/* Legend */}
            <div className="mb-4 flex flex-wrap gap-x-3 gap-y-2 rounded-md border border-gray-800 bg-gray-900 px-4 py-3 sm:gap-x-4 sm:gap-y-1.5">
              <span className="text-sm font-medium text-gray-500 sm:text-xs">
                Content type:
              </span>
              {CONTENT_TYPES.map((ct) => (
                <DefinitionLegendPill
                  key={ct}
                  label={ct}
                  definition={CONTENT_TYPE_DEFINITIONS[ct]}
                  styleClass={CONTENT_TYPE_STYLES[ct]}
                />
              ))}
              <span className="text-sm font-medium text-gray-500 sm:ml-3 sm:text-xs">
                Priority:
              </span>
              {PRIORITIES.map((p) => (
                <DefinitionLegendPill
                  key={p}
                  label={p}
                  definition={PRIORITY_DEFINITIONS[p]}
                  styleClass={PRIORITY_STYLES[p]}
                />
              ))}
              <span className="w-full text-sm text-gray-600 sm:ml-2 sm:w-auto sm:text-xs">
                — Tap a label for definitions. Row badges: hover for tooltip;
                click badge to cycle.
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
                        onOpenSource={handleOpenSource}
                        sourceFocusAnnotationId={sourceFocusAnnotationId}
                        resolvedRange={resolvedLineRanges.get(annotation.id) ?? null}
                        setContentTypeRef={setContentTypeRef}
                        setReviewedCheckboxRef={setReviewedCheckboxRef}
                        onContentTypeFocus={handleContentTypeFocus}
                        onReviewedAdvance={handleReviewedAdvance}
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
                className="w-full rounded-md bg-blue-600 px-5 py-2.5 text-base font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-900 disabled:text-blue-400 sm:w-auto sm:py-2 sm:text-sm"
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

        {selectedFile ? (
          <aside
            className="mt-8 flex w-full min-h-[50vh] max-h-[70vh] flex-col overflow-hidden border-t border-gray-800 bg-gray-950 xl:mt-0 xl:h-screen xl:max-h-screen xl:w-1/2 xl:shrink-0 xl:border-l xl:border-t-0 xl:sticky xl:top-0"
            aria-label="Report source markdown"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-800 bg-gray-900 px-3 py-3 sm:px-4">
              <div className="min-w-0">
                <h2
                  id="source-panel-title"
                  className="truncate text-base font-semibold text-gray-100 sm:text-sm"
                >
                  Report source
                </h2>
                <p className="truncate text-sm text-gray-500 sm:text-xs">
                  {selectedFile}
                </p>
              </div>
              {sourceHighlight ? (
                <button
                  type="button"
                  onClick={clearSourceHighlight}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
                >
                  Clear highlight
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {isSourceLoading && (
                <div className="flex items-center justify-center gap-3 p-8 text-gray-400">
                  <span
                    className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500"
                    aria-hidden
                  />
                  <span className="text-sm">Loading markdown…</span>
                </div>
              )}
              {!isSourceLoading && sourceError && (
                <div className="p-4 text-sm text-red-300">
                  <strong>Error:</strong> {sourceError}
                </div>
              )}
              {!isSourceLoading && !sourceError && sourceMarkdown != null && (
                <div className="p-2 sm:p-3">
                  {sourceLines.map((line, i) => {
                    const lineNum = i + 1;
                    const highlighted =
                      sourceHighlight != null &&
                      lineNum >= sourceHighlight.start &&
                      lineNum <= sourceHighlight.end;
                    return (
                      <div
                        key={i}
                        id={`source-line-${lineNum}`}
                        className={`flex gap-2 border-b border-gray-900/80 font-mono text-sm sm:text-xs ${
                          highlighted
                            ? "bg-amber-900/35 text-gray-100"
                            : "bg-transparent text-gray-300"
                        }`}
                      >
                        <span className="w-12 shrink-0 select-none pr-1 text-right tabular-nums text-gray-600">
                          {lineNum}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                          {line || " "}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
