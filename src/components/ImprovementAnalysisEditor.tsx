"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  XMarkIcon,
  FunnelIcon,
  CheckIcon,
  ArrowDownOnSquareStackIcon,
  CameraIcon,
} from "@heroicons/react/24/outline";
import { useSubjectData } from "~/hooks/useSubjectData";
import { useProject } from "~/hooks/useProject";
import { fetchProjectDocuments, fetchAggregatedPhotoImprovements } from "~/lib/supabase-queries";
import {
  buildDefaultImprovementAnalysisRows,
  normalizeImprovementAnalysisFromDb,
} from "~/lib/improvement-analysis-default-rows";
import { populateImprovementRowsFromSources } from "~/lib/improvement-analysis-populate";
import { IMPROVEMENT_LABEL_TO_PHOTO_KEY } from "~/lib/improvement-constants";
import { ImprovementRefPanel } from "~/components/ImprovementRefPanel";
import type {
  ImprovementAnalysisRow,
  ImprovementCategory,
} from "~/types/comp-data";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ImprovementAnalysisEditorProps {
  projectId: string;
}

const CATEGORY_ORDER: ImprovementCategory[] = [
  "Improvement Characteristics",
  "Ratios & Parking",
  "Age/Life",
  "Structural Characteristics",
  "Interior Characteristics",
  "Mechanical Systems",
  "Site Improvements",
  "Legal/Conforming Status",
];

/** Subtle panel: light = border-{color}-200 + bg-{color}-50/50; dark = border-{color}-800/40 + bg-{color}-950/10 */
const CATEGORY_PANEL: Record<ImprovementCategory, string> = {
  "Improvement Characteristics":
    "rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-950/10",
  "Ratios & Parking":
    "rounded-xl border border-purple-200 bg-purple-50/50 dark:border-purple-800/40 dark:bg-purple-950/10",
  "Age/Life":
    "rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/10",
  "Structural Characteristics":
    "rounded-xl border border-green-200 bg-green-50/50 dark:border-green-800/40 dark:bg-green-950/10",
  "Interior Characteristics":
    "rounded-xl border border-teal-200 bg-teal-50/50 dark:border-teal-800/40 dark:bg-teal-950/10",
  "Mechanical Systems":
    "rounded-xl border border-orange-200 bg-orange-50/50 dark:border-orange-800/40 dark:bg-orange-950/10",
  "Site Improvements":
    "rounded-xl border border-lime-200 bg-lime-50/50 dark:border-lime-800/40 dark:bg-lime-950/10",
  "Legal/Conforming Status":
    "rounded-xl border border-gray-300 bg-gray-50/80 dark:border-gray-700/60 dark:bg-gray-950/20",
};

const CATEGORY_HEADER: Record<ImprovementCategory, string> = {
  "Improvement Characteristics": "text-blue-800 dark:text-blue-200",
  "Ratios & Parking": "text-purple-800 dark:text-purple-200",
  "Age/Life": "text-amber-800 dark:text-amber-200",
  "Structural Characteristics": "text-green-800 dark:text-green-200",
  "Interior Characteristics": "text-teal-800 dark:text-teal-200",
  "Mechanical Systems": "text-orange-800 dark:text-orange-200",
  "Site Improvements": "text-lime-800 dark:text-lime-200",
  "Legal/Conforming Status": "text-gray-800 dark:text-gray-200",
};

const CATEGORY_CHECK: Record<ImprovementCategory, string> = {
  "Improvement Characteristics": "text-blue-500",
  "Ratios & Parking": "text-purple-500",
  "Age/Life": "text-amber-500",
  "Structural Characteristics": "text-green-500",
  "Interior Characteristics": "text-teal-500",
  "Mechanical Systems": "text-orange-500",
  "Site Improvements": "text-lime-500",
  "Legal/Conforming Status": "text-gray-500",
};

type LocalRow = ImprovementAnalysisRow & { clientId: string };

function withClientIds(rows: ImprovementAnalysisRow[]): LocalRow[] {
  return rows.map((r) => ({
    ...r,
    clientId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${r.category}-${r.label}-${Math.random().toString(36).slice(2)}`,
  }));
}

function toPayloadRows(rows: LocalRow[]): ImprovementAnalysisRow[] {
  return rows.map(({ clientId: _c, ...rest }) => rest);
}

/** Multi-select filter dropdown */
function CategoryFilterDropdown({
  activeCategories,
  onToggle,
  onClear,
}: {
  activeCategories: Set<ImprovementCategory>;
  onToggle: (cat: ImprovementCategory) => void;
  onClear: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeCount = activeCategories.size;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
          activeCount > 0
            ? "border-blue-500 bg-blue-600/10 text-blue-400 dark:border-blue-500"
            : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600 hover:bg-gray-800"
        }`}
        title="Filter by category"
      >
        <FunnelIcon className="h-4 w-4" />
        {activeCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[220px] rounded-xl border border-gray-700 bg-gray-900 py-1 shadow-2xl">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onClear();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 transition hover:text-gray-300"
            >
              Show All
            </button>
          )}
          <div className="px-1">
            {CATEGORY_ORDER.map((cat) => {
              const isActive = activeCategories.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onToggle(cat)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-gray-800"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      isActive
                        ? "border-blue-500 bg-blue-600"
                        : "border-gray-600 bg-transparent"
                    }`}
                  >
                    {isActive && <CheckIcon className="h-3 w-3 text-white" />}
                  </span>
                  <span className={`text-left ${isActive ? "text-gray-100" : "text-gray-400"}`}>
                    {cat}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ImprovementAnalysisEditor({
  projectId,
}: ImprovementAnalysisEditorProps) {
  const decodedId = decodeURIComponent(projectId);
  const { subjectData, isLoading, error, saveSubjectData } =
    useSubjectData(decodedId);
  const { project } = useProject(decodedId);

  const [rows, setRows] = useState<LocalRow[]>([]);
  const [docStructuredSlices, setDocStructuredSlices] = useState<unknown[]>([]);
  const [photoImprovements, setPhotoImprovements] = useState<Record<string, string>>({});
  const [activeCategories, setActiveCategories] = useState<Set<ImprovementCategory>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [selectedRefField, setSelectedRefField] = useState<{ label: string; photoKey: string } | null>(null);

  // Auto-save refs — mirrors SubjectDataEditor pattern
  const dirtyRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef<LocalRow[]>(rows);
  rowsRef.current = rows;
  const subjectDataRef = useRef(subjectData);
  subjectDataRef.current = subjectData;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const improvementAnalysisJson = useMemo(
    () => JSON.stringify(subjectData?.improvement_analysis ?? null),
    [subjectData?.improvement_analysis],
  );

  const coreJson = useMemo(
    () => JSON.stringify(subjectData?.core ?? null),
    [subjectData?.core],
  );

  useEffect(() => {
    // Block hydration while user has unsaved edits — guards against realtime
    // updates from another user clobbering in-progress local changes.
    if (dirtyRef.current) return;
    const raw = subjectData?.improvement_analysis;
    const normalized = raw ? normalizeImprovementAnalysisFromDb(raw) : [];
    const base =
      normalized.length > 0 ? normalized : buildDefaultImprovementAnalysisRows();
    setRows(withClientIds(base));
    // Intentionally depend on serialized analysis only so unrelated subject_data updates
    // (taxes, core, etc.) do not reset local row state.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when improvement_analysis payload changes
  }, [improvementAnalysisJson]);

  useEffect(() => {
    let cancelled = false;
    void fetchProjectDocuments(decodedId).then((docs) => {
      if (cancelled) return;
      const slices = docs
        .filter((d) =>
          ["cad", "deed", "engagement"].includes(d.documentType),
        )
        .map((d) => d.structuredData);
      setDocStructuredSlices(slices);
    });
    return () => {
      cancelled = true;
    };
  }, [decodedId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAggregatedPhotoImprovements(decodedId).then((improvements) => {
      if (!cancelled) setPhotoImprovements(improvements);
    }).catch(() => {
      // Non-fatal: photo improvements are supplemental
    });
    return () => {
      cancelled = true;
    };
  }, [decodedId]);

  useEffect(() => {
    if (!subjectData) return;
    const core = (subjectData.core ?? {}) as Record<string, unknown>;
    setRows((prev) => {
      if (prev.length === 0) return prev;
      const merged = populateImprovementRowsFromSources(
        toPayloadRows(prev),
        core,
        project?.propertyType,
        docStructuredSlices,
        photoImprovements,
      );
      let changed = false;
      const next = prev.map((r, i) => {
        const m = merged[i];
        if (!m || m.label !== r.label) return r;
        const wasEmpty = !(r.value?.trim());
        const newVal = m.value ?? "";
        if (!wasEmpty || !newVal) return r;
        changed = true;
        return { ...r, value: newVal };
      });
      return changed ? next : prev;
    });
  }, [subjectData, coreJson, project?.propertyType, docStructuredSlices, photoImprovements]);

  const visibleCategories = useMemo(() => {
    if (activeCategories.size === 0) return CATEGORY_ORDER;
    return CATEGORY_ORDER.filter((c) => activeCategories.has(c));
  }, [activeCategories]);

  const updateRow = useCallback(
    (clientId: string, patch: Partial<ImprovementAnalysisRow>) => {
      dirtyRef.current = true;
      setRows((prev) =>
        prev.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const removeRow = useCallback((clientId: string) => {
    dirtyRef.current = true;
    setRows((prev) => prev.filter((r) => r.clientId !== clientId));
  }, []);

  const addRow = useCallback((category: ImprovementCategory) => {
    dirtyRef.current = true;
    setRows((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        label: "",
        category,
        include: true,
        value: "",
      },
    ]);
  }, []);

  const handlePopulateFromSubjectData = useCallback(() => {
    const core = (subjectData?.core ?? {}) as Record<string, unknown>;
    dirtyRef.current = true;
    setRows((prev) => {
      const merged = populateImprovementRowsFromSources(
        toPayloadRows(prev),
        core,
        project?.propertyType,
        docStructuredSlices,
        photoImprovements,
      );
      return prev.map((r, i) => {
        const m = merged[i];
        if (!m || m.label !== r.label) return r;
        const nextVal = (m.value ?? "").trim();
        if (!nextVal) return r;
        return { ...r, value: m.value };
      });
    });
  }, [subjectData?.core, project?.propertyType, docStructuredSlices, photoImprovements]);

  /** Persist the current rows to Supabase, keeping all other subject_data slices intact. */
  const persistRows = useCallback(async () => {
    const current = subjectDataRef.current;
    if (!current) return;
    setSaveStatus("saving");
    try {
      await saveSubjectData({
        core: current.core ?? {},
        taxes: current.taxes ?? [],
        tax_entities: current.tax_entities ?? [],
        parcels: current.parcels ?? [],
        improvements: current.improvements ?? [],
        improvement_analysis: toPayloadRows(rowsRef.current),
      });
      dirtyRef.current = false;
      if (mountedRef.current) {
        setSaveStatus("saved");
        window.setTimeout(() => {
          if (mountedRef.current) setSaveStatus("idle");
        }, 2500);
      }
    } catch {
      if (mountedRef.current) setSaveStatus("error");
    }
  }, [saveSubjectData]);

  const persistRowsRef = useRef(persistRows);
  persistRowsRef.current = persistRows;

  /** Flush any pending debounced save immediately (blur, tab hide, unmount). */
  const saveNow = useCallback(() => {
    if (!dirtyRef.current) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    void persistRowsRef.current().catch(() => void 0);
  }, []);

  /** 2-second debounced auto-save on every rows change while dirty. */
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      if (!dirtyRef.current) return;
      void persistRowsRef.current().catch(() => void 0);
    }, 2000);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rows change drives this; saveNow is stable
  }, [rows]);

  /** Flush on tab hide. */
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== "hidden") return;
      saveNow();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [saveNow]);

  /** Flush on page unload. */
  useEffect(() => {
    const onPageHide = () => saveNow();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [saveNow]);

  const toggleCategory = (cat: ImprovementCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const clearFilter = () => setActiveCategories(new Set());

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
        Loading improvement analysis…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className={`space-y-5 transition-[margin] duration-300 ${selectedRefField ? "mr-[28rem]" : ""}`}>
      {/* Sticky toolbar — scrollport is project main (see layout min-h-0 + overflow-y-auto) */}
      <div className="sticky top-14 z-30 md:top-0">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200/90 bg-white/85 px-3 py-2.5 shadow-sm ring-1 ring-black/5 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/90 dark:ring-white/5 sm:px-4 sm:py-3">
          <CategoryFilterDropdown
            activeCategories={activeCategories}
            onToggle={toggleCategory}
            onClear={clearFilter}
          />

          <div className="min-w-2 flex-1" />

          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-400" />
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Saved ✓
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-500 dark:text-red-400">
              Save failed
            </span>
          )}

          <button
            type="button"
            onClick={handlePopulateFromSubjectData}
            title="Pull values from parsed subject data documents"
            className="flex items-center justify-center rounded-lg border border-gray-300 bg-gray-50 p-2 text-gray-700 transition hover:border-gray-400 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-700"
          >
            <ArrowDownOnSquareStackIcon className="h-4 w-4" />
            <span className="sr-only">Populate from Subject Data</span>
          </button>
        </div>
      </div>

      {/* Masonry-style columns: balances short cards under tall ones; xl = up to 4 columns */}
      <div
        className="columns-1 [column-gap:theme(spacing.5)] lg:columns-2 xl:columns-4"
        aria-label="Improvement categories"
      >
        {visibleCategories.map((category) => {
          const inCategory = rows.filter((r) => r.category === category);
          const panel = CATEGORY_PANEL[category];
          const headerTone = CATEGORY_HEADER[category];
          const checkColor = CATEGORY_CHECK[category];

          return (
            <section
              key={category}
              className={`mb-5 break-inside-avoid overflow-hidden ${panel}`}
            >
              <div className="border-b border-gray-200/80 px-4 py-3 dark:border-white/10">
                <h2
                  className={`text-sm font-semibold tracking-tight ${headerTone}`}
                >
                  {category}
                </h2>
              </div>

              <div className="divide-y divide-gray-200/70 dark:divide-white/5">
                {inCategory.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-500">
                    No rows in this category yet.
                  </p>
                ) : (
                  inCategory.map((row) => {
                    const photoKey = IMPROVEMENT_LABEL_TO_PHOTO_KEY[row.label];
                    const hasPhotoRef = !!(photoKey && photoImprovements[photoKey]);
                    return (
                      <ImprovementRow
                        key={row.clientId}
                        row={row}
                        checkColor={checkColor}
                        onUpdate={(patch) => updateRow(row.clientId, patch)}
                        onRemove={() => removeRow(row.clientId)}
                        hasPhotoRef={hasPhotoRef}
                        onShowRef={
                          hasPhotoRef && photoKey
                            ? () => setSelectedRefField({ label: row.label, photoKey })
                            : undefined
                        }
                      />
                    );
                  })
                )}
              </div>

              <div className="border-t border-gray-200/80 bg-gray-50/80 px-4 py-3 dark:border-white/10 dark:bg-black/10">
                <button
                  type="button"
                  onClick={() => addRow(category)}
                  className="text-xs font-semibold uppercase tracking-wide text-gray-500 transition hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  + Add row
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {/* Reference image side panel */}
      {selectedRefField && (
        <ImprovementRefPanel
          projectId={decodedId}
          fieldLabel={selectedRefField.label}
          photoKey={selectedRefField.photoKey}
          onClose={() => setSelectedRefField(null)}
        />
      )}
    </div>
  );
}

/** Single improvement row — mobile-friendly stacked layout */
function ImprovementRow({
  row,
  checkColor,
  onUpdate,
  onRemove,
  hasPhotoRef,
  onShowRef,
}: {
  row: LocalRow;
  checkColor: string;
  onUpdate: (patch: Partial<ImprovementAnalysisRow>) => void;
  onRemove: () => void;
  hasPhotoRef?: boolean;
  onShowRef?: () => void;
}) {
  const isCustom = !buildDefaultImprovementAnalysisRows().some(
    (d) => d.label === row.label && d.category === row.category,
  );

  return (
    <div className="group relative px-4 py-3 transition hover:bg-gray-100/60 dark:hover:bg-black/10">
      {/* Label row + include toggle + remove */}
      <div className="mb-1.5 flex items-start gap-2">
        {/* Label — editable only for custom rows */}
        <div className="flex-1">
          {isCustom ? (
            <input
              type="text"
              value={row.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="Field name"
              className="w-full rounded border border-transparent bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-gray-800/60 dark:text-gray-300 dark:placeholder:text-gray-600"
            />
          ) : (
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {row.label}
            </span>
          )}
        </div>

        {/* Photo reference button — visible only when this field has photo-backed data */}
        {hasPhotoRef && onShowRef && (
          <button
            type="button"
            onClick={onShowRef}
            title="View reference photos for this field"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-blue-500 transition hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"
          >
            <CameraIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">View reference photos</span>
          </button>
        )}

        {/* Include checkbox */}
        <button
          type="button"
          role="checkbox"
          aria-checked={row.include}
          onClick={() => onUpdate({ include: !row.include })}
          title={row.include ? "Included in report — click to exclude" : "Excluded from report — click to include"}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            row.include
              ? `border-current bg-current/10 ${checkColor}`
              : "border-gray-600 text-gray-600"
          }`}
        >
          {row.include && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
          <span className="sr-only">{row.include ? "Included" : "Excluded"}</span>
        </button>

        {/* Remove — always visible on mobile, hover only on desktop */}
        <button
          type="button"
          onClick={onRemove}
          title="Remove row"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 transition hover:bg-red-100 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 dark:text-gray-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
        >
          <XMarkIcon className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Remove row</span>
        </button>
      </div>

      {/* Value field */}
      <textarea
        value={row.value}
        onChange={(e) => onUpdate({ value: e.target.value })}
        placeholder="—"
        rows={1}
        className="w-full resize-none rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-gray-700/60 dark:bg-gray-900/60 dark:text-gray-100 dark:placeholder:text-gray-600"
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
      />
    </div>
  );
}
