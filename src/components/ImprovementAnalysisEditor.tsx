"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useSubjectData } from "~/hooks/useSubjectData";
import type {
  ImprovementAnalysisRow,
  ImprovementCategory,
} from "~/types/comp-data";

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

const CATEGORY_PANEL: Record<ImprovementCategory, string> = {
  "Improvement Characteristics":
    "rounded-xl border bg-blue-950/30 border-blue-800",
  "Ratios & Parking": "rounded-xl border bg-purple-950/30 border-purple-800",
  "Age/Life": "rounded-xl border bg-amber-950/30 border-amber-800",
  "Structural Characteristics":
    "rounded-xl border bg-green-950/30 border-green-800",
  "Interior Characteristics":
    "rounded-xl border bg-teal-950/30 border-teal-800",
  "Mechanical Systems":
    "rounded-xl border bg-orange-950/30 border-orange-800",
  "Site Improvements": "rounded-xl border bg-lime-950/30 border-lime-800",
  "Legal/Conforming Status":
    "rounded-xl border bg-gray-800 border-gray-700",
};

const CATEGORY_CHIP: Record<ImprovementCategory, string> = {
  "Improvement Characteristics":
    "border-blue-800 bg-blue-950/40 text-blue-100 data-[active=true]:ring-2 data-[active=true]:ring-blue-400",
  "Ratios & Parking":
    "border-purple-800 bg-purple-950/40 text-purple-100 data-[active=true]:ring-2 data-[active=true]:ring-purple-400",
  "Age/Life":
    "border-amber-800 bg-amber-950/40 text-amber-100 data-[active=true]:ring-2 data-[active=true]:ring-amber-400",
  "Structural Characteristics":
    "border-green-800 bg-green-950/40 text-green-100 data-[active=true]:ring-2 data-[active=true]:ring-green-400",
  "Interior Characteristics":
    "border-teal-800 bg-teal-950/40 text-teal-100 data-[active=true]:ring-2 data-[active=true]:ring-teal-400",
  "Mechanical Systems":
    "border-orange-800 bg-orange-950/40 text-orange-100 data-[active=true]:ring-2 data-[active=true]:ring-orange-400",
  "Site Improvements":
    "border-lime-800 bg-lime-950/40 text-lime-100 data-[active=true]:ring-2 data-[active=true]:ring-lime-400",
  "Legal/Conforming Status":
    "border-gray-700 bg-gray-800 text-gray-100 data-[active=true]:ring-2 data-[active=true]:ring-gray-400",
};

function isImprovementCategory(v: unknown): v is ImprovementCategory {
  return typeof v === "string" && (CATEGORY_ORDER as string[]).includes(v);
}

function buildDefaultRows(): ImprovementAnalysisRow[] {
  const add = (
    category: ImprovementCategory,
    labels: string[],
  ): ImprovementAnalysisRow[] =>
    labels.map((label) => ({
      label,
      category,
      include: true,
      value: "",
    }));

  return [
    ...add("Improvement Characteristics", [
      "Property Type",
      "Property Subtype",
      "Occupancy",
      "Number of Buildings",
      "Number of Stories",
      "Construction Class",
      "Construction Quality",
      "Gross Building Area (GBA)",
      "Net Rentable Area (NRA)",
    ]),
    ...add("Ratios & Parking", [
      "Land/Bld Ratio",
      "Floor Area Ratio",
      "Parking (SF)",
      "Parking Spaces",
      "Parking Ratio",
    ]),
    ...add("Age/Life", [
      "Year Built",
      "Condition",
      "Age",
      "Effective Age",
      "Typical Building Life",
      "Remaining Economic Life",
    ]),
    ...add("Structural Characteristics", [
      "Foundation",
      "Roof Type/Material",
      "Building Frame",
      "Exterior Walls",
    ]),
    ...add("Interior Characteristics", [
      "Floors",
      "Walls",
      "Ceiling",
      "Lighting",
      "Restrooms",
    ]),
    ...add("Mechanical Systems", [
      "Electrical",
      "Plumbing",
      "Heating",
      "Air Conditioning",
      "Fire Protection/Sprinklers",
      "Number of Elevators",
    ]),
    ...add("Site Improvements", ["Site Improvements", "Landscaping"]),
    ...add("Legal/Conforming Status", [
      "Legally Permitted Use",
      "Conforms to Parking",
      "Conformity Conclusion",
    ]),
  ];
}

function asDisplayString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function normalizeFromDb(raw: unknown): ImprovementAnalysisRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === "object")
    .map((x) => ({
      label: asDisplayString(x.label),
      category: isImprovementCategory(x.category)
        ? x.category
        : "Improvement Characteristics",
      include: Boolean(x.include),
      value: asDisplayString(x.value),
    }));
}

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

export function ImprovementAnalysisEditor({
  projectId,
}: ImprovementAnalysisEditorProps) {
  const { subjectData, isLoading, error, saveSubjectData } =
    useSubjectData(projectId);

  const [rows, setRows] = useState<LocalRow[]>([]);
  const [filterCategory, setFilterCategory] = useState<
    ImprovementCategory | "all"
  >("all");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const improvementAnalysisJson = useMemo(
    () => JSON.stringify(subjectData?.improvement_analysis ?? null),
    [subjectData?.improvement_analysis],
  );

  useEffect(() => {
    const raw = subjectData?.improvement_analysis;
    const normalized = raw ? normalizeFromDb(raw) : [];
    const base = normalized.length > 0 ? normalized : buildDefaultRows();
    setRows(withClientIds(base));
    // Intentionally depend on serialized analysis only so unrelated subject_data updates
    // (taxes, core, etc.) do not reset local row state.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when improvement_analysis payload changes
  }, [improvementAnalysisJson]);

  const visibleCategories = useMemo(() => {
    if (filterCategory === "all") return CATEGORY_ORDER;
    return [filterCategory];
  }, [filterCategory]);

  const updateRow = useCallback(
    (clientId: string, patch: Partial<ImprovementAnalysisRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const removeRow = useCallback((clientId: string) => {
    setRows((prev) => prev.filter((r) => r.clientId !== clientId));
  }, []);

  const addRow = useCallback((category: ImprovementCategory) => {
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

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const payloadRows = toPayloadRows(rows);
      await saveSubjectData({
        core: subjectData?.core ?? {},
        taxes: subjectData?.taxes ?? [],
        tax_entities: subjectData?.tax_entities ?? [],
        parcels: subjectData?.parcels ?? [],
        improvements: subjectData?.improvements ?? [],
        improvement_analysis: payloadRows,
      });
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFilter = (cat: ImprovementCategory) => {
    setFilterCategory((prev) => (prev === cat ? "all" : cat));
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-gray-800 bg-gray-950 py-16 text-sm text-gray-400">
        Loading improvement analysis…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border border-gray-800 bg-gray-950 p-6 text-gray-100 shadow-inner">
      {/* Header: filters + save */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Category filter
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-active={filterCategory === "all"}
              onClick={() => setFilterCategory("all")}
              className="rounded-full border border-gray-600 bg-gray-900 px-3 py-1 text-xs font-medium text-gray-200 transition hover:bg-gray-800 data-[active=true]:ring-2 data-[active=true]:ring-gray-400"
            >
              All
            </button>
            {CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                data-active={filterCategory === cat}
                onClick={() => toggleFilter(cat)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition hover:opacity-90 ${CATEGORY_CHIP[cat]}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
          {saveSuccess && (
            <span className="text-sm font-medium text-emerald-400">Saved</span>
          )}
          {saveError && (
            <span className="max-w-xs text-right text-sm text-red-400">
              {saveError}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Grouped sections */}
      <div className="space-y-6">
        {visibleCategories.map((category) => {
          const inCategory = rows.filter((r) => r.category === category);
          const panel = CATEGORY_PANEL[category];

          return (
            <section
              key={category}
              className={`overflow-hidden ${panel}`}
            >
              <div className="border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-semibold tracking-tight text-gray-100">
                  {category}
                </h2>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(8rem,1.2fr)_2.25rem] gap-3 border-b border-white/5 bg-black/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <span>Label</span>
                <span className="text-center">Include</span>
                <span className="text-right">Value</span>
                <span className="sr-only">Remove</span>
              </div>

              <div className="divide-y divide-white/5">
                {inCategory.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-500">
                    No rows in this category yet.
                  </p>
                ) : (
                  inCategory.map((row) => (
                    <div
                      key={row.clientId}
                      className="group relative grid grid-cols-[minmax(0,1fr)_auto_minmax(8rem,1.2fr)_2.25rem] items-center gap-3 px-4 py-2.5 transition hover:bg-black/15"
                    >
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) =>
                          updateRow(row.clientId, { label: e.target.value })
                        }
                        placeholder="Characteristic"
                        className="w-full rounded-md border border-transparent bg-gray-900/60 px-2 py-1.5 text-sm text-gray-100 placeholder:text-gray-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) =>
                            updateRow(row.clientId, {
                              include: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                        />
                      </div>
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) =>
                          updateRow(row.clientId, { value: e.target.value })
                        }
                        placeholder="—"
                        className="w-full rounded-md border border-transparent bg-gray-900/60 px-2 py-1.5 text-right text-sm text-gray-100 placeholder:text-gray-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeRow(row.clientId)}
                          title="Remove row"
                          className="rounded p-1 text-gray-600 opacity-0 transition hover:bg-red-950/50 hover:text-red-400 group-hover:opacity-100"
                        >
                          <XMarkIcon className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Remove row</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-white/10 bg-black/10 px-4 py-3">
                <button
                  type="button"
                  onClick={() => addRow(category)}
                  className="text-xs font-semibold uppercase tracking-wide text-gray-400 transition hover:text-gray-200"
                >
                  + Add row
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
