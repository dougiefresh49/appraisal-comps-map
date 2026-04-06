"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  XMarkIcon,
  ChevronDownIcon,
  LightBulbIcon,
} from "@heroicons/react/24/outline";

/** Mirrors API shape from `generateSuggestions` (client-safe duplicate; server `suggestions.ts` is server-only). */
interface Suggestion {
  text: string;
  confidence: "high" | "medium" | "low";
  source: string;
  details?: string;
}

interface SuggestionCategory {
  category: string;
  title: string;
  suggestions: Suggestion[];
}

interface ProjectSuggestionsPayload {
  projectId: string;
  projectName: string;
  similarProjectCount: number;
  categories: SuggestionCategory[];
  generatedAt: string;
}

interface SimilarProjectRow {
  projectId: string;
  projectName: string;
  propertyType: string | null;
  city: string | null;
  county: string | null;
  similarityScore: number;
  matchReasons: string[];
  hasExtractedData: boolean;
}

interface SimilarProjectsApiPayload {
  projectId: string;
  similarProjects: SimilarProjectRow[];
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; suggestions: ProjectSuggestionsPayload; similarNames: string[] }
  | { kind: "error"; message: string };

const ANALYSIS_KEYS = new Set([
  "zoning",
  "ownership",
  "subject-site-summary",
  "highest-best-use",
]);

const PINNED_CATEGORIES = new Set(["section_topics", "adjustment_categories"]);

function confidenceBadgeClass(confidence: Suggestion["confidence"]): string {
  if (confidence === "high") {
    return "bg-emerald-900/50 text-emerald-300";
  }
  if (confidence === "medium") {
    return "bg-amber-900/50 text-amber-300";
  }
  return "bg-gray-800 text-gray-400";
}

interface SuggestionsPanelProps {
  projectId: string;
  sectionKey?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SuggestionsPanel({
  projectId,
  sectionKey,
  isOpen,
  onClose,
}: SuggestionsPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedDetailsIds, setExpandedDetailsIds] = useState<Set<string>>(
    () => new Set(),
  );

  const runFetch = useCallback(async () => {
    setLoadState({ kind: "loading" });
    try {
      const [sugRes, simRes] = await Promise.all([
        fetch(`/api/suggestions?project_id=${encodeURIComponent(projectId)}`),
        fetch(
          `/api/suggestions/similar-projects?project_id=${encodeURIComponent(projectId)}`,
        ),
      ]);

      if (!sugRes.ok) {
        const errBody = (await sugRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errBody.error ?? `Suggestions failed (${sugRes.status})`);
      }

      const suggestions = (await sugRes.json()) as ProjectSuggestionsPayload;

      let similarNames: string[] = [];
      if (simRes.ok) {
        const simJson = (await simRes.json()) as SimilarProjectsApiPayload;
        similarNames = (simJson.similarProjects ?? []).map((p) => p.projectName);
      }

      setLoadState({
        kind: "success",
        suggestions,
        similarNames,
      });
    } catch (e) {
      setLoadState({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load suggestions",
      });
    }
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) return;
    if (loadState.kind !== "idle") return;
    void runFetch();
  }, [isOpen, loadState.kind, runFetch]);

  useEffect(() => {
    setLoadState({ kind: "idle" });
    setExpandedCategoryKeys(new Set());
    setExpandedDetailsIds(new Set());
  }, [projectId]);

  const orderedCategories = useMemo(() => {
    if (loadState.kind !== "success") return [];
    const cats = [...loadState.suggestions.categories];
    const highlight =
      sectionKey && ANALYSIS_KEYS.has(sectionKey)
        ? (c: SuggestionCategory) => PINNED_CATEGORIES.has(c.category)
        : () => false;
    cats.sort((a, b) => {
      const ah = highlight(a) ? 0 : 1;
      const bh = highlight(b) ? 0 : 1;
      if (ah !== bh) return ah - bh;
      return 0;
    });
    return cats;
  }, [loadState, sectionKey]);

  useEffect(() => {
    if (loadState.kind !== "success") return;
    const withSugs = orderedCategories.filter((c) => c.suggestions.length > 0);
    if (withSugs.length === 0) return;
    const firstTwo = withSugs.slice(0, 2).map((c) => c.category);
    setExpandedCategoryKeys(new Set(firstTwo));
  }, [loadState, orderedCategories]);

  const toggleCategory = useCallback((key: string) => {
    setExpandedCategoryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleDetails = useCallback((id: string) => {
    setExpandedDetailsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const totalSuggestions = useMemo(() => {
    if (loadState.kind !== "success") return 0;
    return loadState.suggestions.categories.reduce(
      (n, c) => n + c.suggestions.length,
      0,
    );
  }, [loadState]);

  const handleRetry = useCallback(() => {
    void runFetch();
  }, [runFetch]);

  if (!isOpen) return null;

  const showLoading =
    loadState.kind === "loading" || loadState.kind === "idle";

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 top-14 flex flex-col border-t border-gray-800 bg-gray-950 shadow-2xl md:inset-x-auto md:inset-y-0 md:right-0 md:top-0 md:w-full md:max-w-md md:border-l md:border-t-0">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 md:px-6 md:py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Suggestions</h2>
            {loadState.kind === "success" && (
              <p className="mt-0.5 text-xs text-gray-500">
                Based on {loadState.suggestions.similarProjectCount} similar past
                project
                {loadState.suggestions.similarProjectCount === 1 ? "" : "s"}
              </p>
            )}
            {showLoading && (
              <p className="mt-0.5 text-xs text-gray-500">Loading…</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
            aria-label="Close suggestions panel"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {showLoading && (
            <div className="space-y-4 py-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-800" />
              <div className="h-24 animate-pulse rounded-lg bg-gray-900" />
              <div className="h-24 animate-pulse rounded-lg bg-gray-900" />
              <div className="flex items-center justify-center gap-2 py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
                <span className="text-xs text-gray-500">Loading suggestions…</span>
              </div>
            </div>
          )}

          {loadState.kind === "error" && (
            <div className="py-8 text-center">
              <p className="text-sm text-red-300/90">{loadState.message}</p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-4 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-800"
              >
                Retry
              </button>
            </div>
          )}

          {loadState.kind === "success" && (
            <>
              {loadState.similarNames.length > 0 && (
                <div
                  className={`mb-4 rounded-lg border px-3 py-2.5 ${
                    sectionKey && ANALYSIS_KEYS.has(sectionKey)
                      ? "border-blue-900/50 bg-blue-950/20"
                      : "border-gray-800 bg-gray-900/50"
                  }`}
                >
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Similar projects
                  </h3>
                  <p className="mt-1 text-xs text-gray-300">
                    {loadState.similarNames.join(" · ")}
                  </p>
                </div>
              )}

              {totalSuggestions === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500">
                    No suggestions available yet. Suggestions are generated from
                    similar past reports.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orderedCategories.map((cat) => {
                    const isOpenCat = expandedCategoryKeys.has(cat.category);
                    const isPinned =
                      !!sectionKey &&
                      ANALYSIS_KEYS.has(sectionKey) &&
                      PINNED_CATEGORIES.has(cat.category);
                    if (cat.suggestions.length === 0) return null;
                    return (
                      <div
                        key={cat.category}
                        className={`overflow-hidden rounded-lg border ${
                          isPinned
                            ? "border-blue-900/40 bg-gray-900/60"
                            : "border-gray-800 bg-gray-900/40"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat.category)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-gray-800/50"
                        >
                          <span className="text-xs font-semibold text-gray-200">
                            {cat.title}
                            <span className="ml-1.5 font-normal text-gray-500">
                              ({cat.suggestions.length})
                            </span>
                          </span>
                          <ChevronDownIcon
                            className={`h-4 w-4 shrink-0 text-gray-500 transition ${
                              isOpenCat ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {isOpenCat && (
                          <div className="space-y-2 border-t border-gray-800 px-3 py-2">
                            {cat.suggestions.map((sug, idx) => {
                              const detailId = `${cat.category}-${idx}`;
                              const detailsOpen = expandedDetailsIds.has(detailId);
                              return (
                                <div
                                  key={detailId}
                                  className="rounded-lg border border-gray-800 bg-gray-950/60 p-3"
                                >
                                  <div className="flex flex-wrap items-start gap-2">
                                    <p className="min-w-0 flex-1 text-sm leading-snug text-gray-100">
                                      {sug.text}
                                    </p>
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${confidenceBadgeClass(
                                        sug.confidence,
                                      )}`}
                                    >
                                      {sug.confidence}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-[11px] text-gray-500">
                                    {sug.source}
                                  </p>
                                  {sug.details && sug.details.length > 0 && (
                                    <div className="mt-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleDetails(detailId)}
                                        className="text-xs font-medium text-blue-400 hover:text-blue-300"
                                      >
                                        {detailsOpen ? "Hide details" : "Details"}
                                      </button>
                                      {detailsOpen && (
                                        <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-400">
                                          {sug.details}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface SuggestionsPanelToggleProps {
  onClick: () => void;
  suggestionCount?: number;
}

export function SuggestionsPanelToggle({
  onClick,
  suggestionCount,
}: SuggestionsPanelToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:border-gray-600 hover:bg-gray-800 hover:text-gray-200"
      title="View suggestions from similar reports"
    >
      <LightBulbIcon className="h-3.5 w-3.5" />
      Suggestions
      {suggestionCount !== undefined && suggestionCount > 0 && (
        <span className="rounded-full bg-blue-900/50 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
          {suggestionCount}
        </span>
      )}
    </button>
  );
}
