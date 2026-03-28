"use client";

import { useState, useCallback, useEffect } from "react";
import { useSubjectData } from "~/hooks/useSubjectData";
import type { ParcelImprovement, ImprovementCategory } from "~/types/comp-data";

interface ImprovementAnalysisEditorProps {
  projectId: string;
}

const CATEGORY_COLORS: Record<ImprovementCategory, string> = {
  "Improvement Characteristics": "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
  "Ratios & Parking": "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
  "Age/Life": "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
  "Structural Characteristics": "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
  "Interior Characteristics": "bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800",
  "Mechanical Systems": "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800",
  "Site Improvements": "bg-lime-50 border-lime-200 dark:bg-lime-950/30 dark:border-lime-800",
  "Legal/Conforming Status": "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700",
};

const IMPROVEMENT_FIELDS: {
  key: keyof ParcelImprovement;
  label: string;
  category: ImprovementCategory;
  type: "text" | "number" | "boolean";
}[] = [
  // Improvement Characteristics
  { key: "Building #", label: "Building #", category: "Improvement Characteristics", type: "number" },
  { key: "Section #", label: "Section #", category: "Improvement Characteristics", type: "number" },
  { key: "Gross Building Area (SF)", label: "Gross Building Area (SF)", category: "Improvement Characteristics", type: "number" },
  { key: "Is GLA", label: "Is GLA", category: "Improvement Characteristics", type: "boolean" },
  // Ratios & Parking
  { key: "Parking (SF)", label: "Parking (SF)", category: "Ratios & Parking", type: "number" },
  { key: "Storage Area (SF)", label: "Storage Area (SF)", category: "Ratios & Parking", type: "number" },
  // Age/Life
  { key: "Year Built", label: "Year Built", category: "Age/Life", type: "number" },
  // Structural Characteristics
  { key: "Construction", label: "Construction", category: "Structural Characteristics", type: "text" },
  // Interior Characteristics
  { key: "Office Area (SF)", label: "Office Area (SF)", category: "Interior Characteristics", type: "number" },
  { key: "Warehouse Area (SF)", label: "Warehouse Area (SF)", category: "Interior Characteristics", type: "number" },
  // Site Improvements — stored as comments
  { key: "Comments", label: "Comments", category: "Site Improvements", type: "text" },
];

type ImpRow = Partial<ParcelImprovement>;

function ImprovementRow({
  imp,
  idx,
  onChange,
  onRemove,
}: {
  imp: ImpRow;
  idx: number;
  onChange: (idx: number, key: keyof ParcelImprovement, value: unknown) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Building {imp["Building #"] ?? idx + 1} — Section {imp["Section #"] ?? 1}
        </h4>
        <button
          type="button"
          onClick={() => onRemove(idx)}
          className="text-xs text-gray-400 hover:text-red-500"
        >
          Remove
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {IMPROVEMENT_FIELDS.map(({ key, label, category, type }) => {
          const borderClass = CATEGORY_COLORS[category];
          const value = imp[key];

          return (
            <div key={key} className={`rounded border p-2 ${borderClass}`}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {label}
              </label>
              {type === "boolean" ? (
                <button
                  type="button"
                  onClick={() => onChange(idx, key, !value)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    value ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      value ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              ) : (
                <input
                  type={type}
                  value={value != null ? String(value) : ""}
                  onChange={(e) =>
                    onChange(
                      idx,
                      key,
                      type === "number"
                        ? e.target.value
                          ? Number(e.target.value)
                          : null
                        : e.target.value || null,
                    )
                  }
                  className="w-full rounded border-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:ring-0 dark:text-gray-100"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ImprovementAnalysisEditor({
  projectId,
}: ImprovementAnalysisEditorProps) {
  const { subjectData, isLoading, error, saveSubjectData } =
    useSubjectData(projectId);

  const [improvements, setImprovements] = useState<ImpRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (subjectData) {
      setImprovements((subjectData.improvements as ImpRow[]) ?? []);
    }
  }, [subjectData]);

  const handleChange = useCallback(
    (idx: number, key: keyof ParcelImprovement, value: unknown) => {
      setImprovements((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], [key]: value };
        return next;
      });
    },
    [],
  );

  const handleRemove = useCallback((idx: number) => {
    setImprovements((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAdd = () => {
    setImprovements((prev) => [
      ...prev,
      {
        "Building #": prev.length + 1,
        "Section #": 1,
        instrumentNumber: null,
        APN: "",
        "Year Built": null,
        "Gross Building Area (SF)": null,
        "Office Area (SF)": null,
        "Warehouse Area (SF)": null,
        "Parking (SF)": null,
        "Storage Area (SF)": null,
        "Is GLA": true,
        Construction: "",
        Comments: null,
      },
    ]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveSubjectData({
        improvements: improvements as ParcelImprovement[],
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        Loading improvement data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_COLORS) as ImprovementCategory[]).map((cat) => (
            <span
              key={cat}
              className={`rounded border px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[cat]}`}
            >
              {cat}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              Saved ✓
            </span>
          )}
          {saveError && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {saveError}
            </span>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Improvement Rows */}
      {improvements.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center dark:border-gray-700 dark:bg-gray-800/50">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No improvements added yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {improvements.map((imp, idx) => (
            <ImprovementRow
              key={idx}
              imp={imp}
              idx={idx}
              onChange={handleChange}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-200"
      >
        + Add Improvement
      </button>
    </div>
  );
}
