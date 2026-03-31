"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useProject } from "~/hooks/useProject";
import { createClient } from "~/utils/supabase/client";
import { computeGeneratedFields } from "~/lib/calculated-fields";
import type { Comparable } from "~/utils/projectStore";

// ============================================================
// Types
// ============================================================

export type CompUITemplateType = "Land" | "Sales" | "Rentals";
export type SalesVariant = "default" | "income";
type TemplateKey = "land" | "sales" | "salesIncome" | "rentals";

export interface CompTemplateRow {
  label: string;
  fieldKey: string;
}

export interface CompTemplateSection {
  title: string;
  side: "left" | "right" | "full";
  rows: CompTemplateRow[];
}

type TemplateStore = Partial<Record<TemplateKey, CompTemplateSection[]>>;

// ============================================================
// Helpers
// ============================================================

function templateKeyForType(
  compType: CompUITemplateType,
  variant: SalesVariant = "default",
): TemplateKey {
  if (compType === "Land") return "land";
  if (compType === "Rentals") return "rentals";
  return variant === "income" ? "salesIncome" : "sales";
}

function titleForCompType(compType: CompUITemplateType): string {
  if (compType === "Land") return "COMPARABLE LAND SALE";
  if (compType === "Sales") return "COMPARABLE SALE";
  return "COMPARABLE LEASE";
}

function formatRawValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value as string | number);
}

function readField(raw: Record<string, unknown>, fieldKey: string): string {
  return formatRawValue(raw[fieldKey]);
}

// ============================================================
// Default template sections per type/variant
// ============================================================

function r(label: string, fieldKey: string): CompTemplateRow {
  return { label, fieldKey };
}

function getDefaultSections(key: TemplateKey): CompTemplateSection[] {
  switch (key) {
    case "land":
      return [
        {
          title: "Property Information",
          side: "left",
          rows: [
            r("Address", "Address"),
            r("APN", "APN"),
            r("Legal", "Legal"),
            r("Land Size (AC)", "Land Size (AC)"),
            r("Zoning", "Zoning"),
            r("Corner", "Corner"),
            r("Highway Frontage", "Highway Frontage"),
          ],
        },
        {
          title: "Utilities & Surface",
          side: "left",
          rows: [
            r("Utils - Electricity", "Utils - Electricity"),
            r("Utils - Water", "Utils - Water"),
            r("Utils - Sewer", "Utils - Sewer"),
            r("Surface", "Surface"),
          ],
        },
        {
          title: "Sale Information",
          side: "left",
          rows: [
            r("Sale Price", "Sale Price"),
            r("Date of Sale", "Date of Sale"),
            r("Recording", "Recording"),
            r("Grantor", "Grantor"),
            r("Grantee", "Grantee"),
          ],
        },
        {
          title: "Key Indicators",
          side: "right",
          rows: [
            r("Sale Price / AC", "Sale Price / AC"),
            r("Sale Price / SF", "Sale Price / SF"),
          ],
        },
        {
          title: "Comments",
          side: "full",
          rows: [r("", "Comments")],
        },
      ];

    case "sales":
      return [
        {
          title: "Property Information",
          side: "left",
          rows: [
            r("Address", "Address"),
            r("APN", "APN"),
            r("Legal", "Legal"),
            r("Property Type", "Property Type"),
            r("Building Size (SF)", "Building Size (SF)"),
            r("Land Size (AC)", "Land Size (AC)"),
            r("Year Built", "Year Built"),
            r("Condition", "Condition"),
          ],
        },
        {
          title: "Sale Information",
          side: "left",
          rows: [
            r("Sale Price", "Sale Price"),
            r("Date of Sale", "Date of Sale"),
            r("Recording", "Recording"),
          ],
        },
        {
          title: "Key Indicators",
          side: "right",
          rows: [
            r("Sale Price / SF", "Sale Price / SF"),
            r("Overall Cap Rate", "Overall Cap Rate"),
            r("Gross Income Multiplier", "Gross Income Multiplier"),
          ],
        },
        {
          title: "Comments",
          side: "full",
          rows: [r("", "Comments")],
        },
      ];

    case "salesIncome":
      return [
        {
          title: "Property Information",
          side: "left",
          rows: [
            r("Address", "Address"),
            r("APN", "APN"),
            r("Legal", "Legal"),
            r("Property Type", "Property Type"),
            r("Building Size (SF)", "Building Size (SF)"),
            r("Land Size (AC)", "Land Size (AC)"),
            r("Year Built", "Year Built"),
            r("Condition", "Condition"),
          ],
        },
        {
          title: "Income Analysis",
          side: "right",
          rows: [
            r("Rent / SF", "Rent / SF"),
            r("Potential Gross Income", "Potential Gross Income"),
            r("Vacancy %", "Vacancy %"),
            r("Effective Gross Income", "Effective Gross Income"),
            r("Taxes", "Taxes"),
            r("Insurance", "Insurance"),
            r("Expenses", "Expenses"),
            r("Net Operating Income", "Net Operating Income"),
          ],
        },
        {
          title: "Property Improvements",
          side: "left",
          rows: [
            r("HVAC", "HVAC"),
            r("Overhead Doors", "Overhead Doors"),
            r("Wash Bay", "Wash Bay"),
            r("Hoisting", "Hoisting"),
            r("Construction", "Construction"),
            r("Other Features", "Other Features"),
          ],
        },
        {
          title: "Key Indicators",
          side: "right",
          rows: [
            r("Overall Cap Rate", "Overall Cap Rate"),
            r("Gross Income Multiplier", "Gross Income Multiplier"),
            r("Sale Price / SF", "Sale Price / SF"),
          ],
        },
        {
          title: "Comments",
          side: "full",
          rows: [r("", "Comments")],
        },
      ];

    case "rentals":
      return [
        {
          title: "Property & Lease",
          side: "left",
          rows: [
            r("Address", "Address"),
            r("APN", "APN"),
            r("Legal", "Legal"),
            r("Rentable SF", "Rentable SF"),
            r("Land Size (AC)", "Land Size (AC)"),
            r("Year Built", "Year Built"),
            r("Condition", "Condition"),
            r("Lessor", "Lessor"),
            r("Tenant", "Tenant"),
            r("Lease Start", "Lease Start"),
            r("Expense Structure", "Expense Structure"),
          ],
        },
        {
          title: "Key Indicators",
          side: "right",
          rows: [
            r("Rent / Month", "Rent / Month"),
            r("Rent / SF / Year", "Rent / SF / Year"),
          ],
        },
        {
          title: "Comments",
          side: "full",
          rows: [r("", "Comments")],
        },
      ];
  }
}

// ============================================================
// Hook: batch load parsed data for all comps
// ============================================================

function useCompsParsedDataBatch(compIds: string[]) {
  const [dataMap, setDataMap] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  const idsKey = compIds.join(",");

  useEffect(() => {
    if (compIds.length === 0) {
      setDataMap({});
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("comp_parsed_data")
        .select("comp_id, raw_data")
        .in("comp_id", compIds);

      if (cancelled) return;
      if (error) {
        console.error("Failed to load batch parsed data", error);
        setIsLoading(false);
        return;
      }

      const map: Record<string, Record<string, unknown>> = {};
      for (const row of data ?? []) {
        const compId = row.comp_id as string | null;
        if (compId && row.raw_data && typeof row.raw_data === "object") {
          map[compId] = computeGeneratedFields(
            row.raw_data as Record<string, unknown>,
          );
        }
      }
      setDataMap(map);
      setIsLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { dataMap, isLoading };
}

// ============================================================
// Hook: load/save comp UI templates from projects table
// ============================================================

function useCompTemplates(projectId: string) {
  const [store, setStore] = useState<TemplateStore>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("comp_ui_templates")
        .eq("id", projectId)
        .single();

      if (cancelled) return;
      if (error) {
        console.error("Failed to load comp_ui_templates", error);
        setIsLoaded(true);
        return;
      }

      const raw = (data as Record<string, unknown> | null)
        ?.comp_ui_templates;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        setStore(raw as TemplateStore);
      }
      setIsLoaded(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const saveTemplate = useCallback(
    async (key: TemplateKey, sections: CompTemplateSection[]) => {
      setStore((prev) => {
        const updated = { ...prev, [key]: sections };

        void (async () => {
          const supabase = createClient();
          await supabase
            .from("projects")
            .update({ comp_ui_templates: updated })
            .eq("id", projectId);
        })();

        return updated;
      });
    },
    [projectId],
  );

  return { store, isLoaded, saveTemplate };
}

// ============================================================
// Sub-component: section block (label/value pairs)
// ============================================================

function SectionBlock({
  title,
  items,
  isHighlighted,
}: {
  title: string;
  items: { label: string; value: string }[];
  isHighlighted?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5">
      <div className="mb-1.5 border-b border-gray-300 bg-gray-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 print:border-gray-300 print:bg-gray-100 print:text-gray-800">
        {title}
      </div>
      <div className="space-y-0.5 px-2">
        {items.map((item, idx) => (
          <div
            key={`${item.label}-${idx}`}
            className="grid grid-cols-[140px_1fr] gap-3 text-sm"
          >
            <div className="text-gray-500 dark:text-gray-400 print:text-gray-500">
              {item.label}
            </div>
            <div
              className={`whitespace-pre-wrap text-gray-900 dark:text-gray-100 print:text-gray-900 ${
                isHighlighted ? "font-semibold" : ""
              }`}
            >
              {item.value || "\u2014"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Sub-component: rendered comp card
// ============================================================

function CompRendered({
  comp,
  index,
  compType,
  rawData,
  sections,
}: {
  comp: Comparable;
  index: number;
  compType: CompUITemplateType;
  rawData: Record<string, unknown>;
  sections: CompTemplateSection[];
}) {
  const leftSections = sections.filter((s) => s.side === "left");
  const rightSections = sections.filter((s) => s.side === "right");
  const fullSections = sections.filter((s) => s.side === "full");

  const imageUrl =
    comp.images?.[0]?.webViewLink ?? comp.images?.[0]?.webViewUrl;

  return (
    <div
      id={`comp-render-${comp.id}`}
      className="scroll-mt-24 rounded-lg border border-gray-200 bg-white p-8 text-gray-900 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 print:rounded-none print:border-gray-200 print:bg-white print:text-gray-900"
    >
      <div className="mb-6 text-center">
        <h2 className="text-lg font-bold uppercase text-gray-900 dark:text-gray-100 print:text-gray-900">
          {titleForCompType(compType)} NO. {index + 1}
        </h2>
        {comp.address && (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {comp.address}
          </p>
        )}
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          {leftSections.map((section) => (
            <SectionBlock
              key={section.title}
              title={section.title}
              items={section.rows.map((row) => ({
                label: row.label,
                value: readField(rawData, row.fieldKey),
              }))}
            />
          ))}
        </div>
        <div>
          {imageUrl ? (
            <div className="mb-5 overflow-hidden border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950/50 print:border-gray-200 print:bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Property"
                className="h-56 w-full object-cover"
              />
            </div>
          ) : (
            <div className="mb-5 flex h-56 items-center justify-center border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400 dark:border-gray-600 dark:bg-gray-950/40 dark:text-gray-500 print:border-gray-200 print:bg-gray-50">
              No image
            </div>
          )}
          {rightSections.map((section) => (
            <SectionBlock
              key={section.title}
              title={section.title}
              isHighlighted={section.title === "Key Indicators"}
              items={section.rows.map((row) => ({
                label: row.label,
                value: readField(rawData, row.fieldKey),
              }))}
            />
          ))}
        </div>
      </div>

      {fullSections.map((section) => (
        <div key={section.title} className="mt-2">
          <SectionBlock
            title={section.title}
            items={section.rows.map((row) => ({
              label: row.label || section.title,
              value: readField(rawData, row.fieldKey),
            }))}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Sub-component: template editor
// ============================================================

function TemplateEditor({
  sections,
  onChange,
  onSave,
  onCancel,
  availableKeys,
  saving,
}: {
  sections: CompTemplateSection[];
  onChange: (sections: CompTemplateSection[]) => void;
  onSave: () => void;
  onCancel: () => void;
  availableKeys: string[];
  saving: boolean;
}) {
  const updateRow = (
    sectionIdx: number,
    rowIdx: number,
    fieldKey: string,
  ) => {
    const updated = sections.map((s, si) => {
      if (si !== sectionIdx) return s;
      const rows = s.rows.map((row, ri) =>
        ri === rowIdx ? { label: fieldKey, fieldKey } : row,
      );
      return { ...s, rows };
    });
    onChange(updated);
  };

  const addRow = (sectionIdx: number) => {
    const updated = sections.map((s, i) => {
      if (i !== sectionIdx) return s;
      return { ...s, rows: [...s.rows, { label: "", fieldKey: "" }] };
    });
    onChange(updated);
  };

  const removeRow = (sectionIdx: number, rowIdx: number) => {
    const updated = sections.map((s, i) => {
      if (i !== sectionIdx) return s;
      return { ...s, rows: s.rows.filter((_, ri) => ri !== rowIdx) };
    });
    onChange(updated);
  };

  const addSection = () => {
    onChange([
      ...sections,
      { title: "New Section", side: "left", rows: [] },
    ]);
  };

  const removeSection = (sectionIdx: number) => {
    onChange(sections.filter((_, i) => i !== sectionIdx));
  };

  const updateSectionTitle = (sectionIdx: number, title: string) => {
    const updated = sections.map((s, i) =>
      i === sectionIdx ? { ...s, title } : s,
    );
    onChange(updated);
  };

  const updateSectionSide = (
    sectionIdx: number,
    side: CompTemplateSection["side"],
  ) => {
    const updated = sections.map((s, i) =>
      i === sectionIdx ? { ...s, side } : s,
    );
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {sections.map((section, si) => (
        <div
          key={`section-${si}`}
          className="rounded-lg border border-gray-700 bg-gray-800/50 p-4"
        >
          <div className="mb-3 flex items-center gap-3">
            <input
              type="text"
              value={section.title}
              onChange={(e) => updateSectionTitle(si, e.target.value)}
              className="flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
              placeholder="Section title"
            />
            <select
              value={section.side}
              onChange={(e) =>
                updateSectionSide(
                  si,
                  e.target.value as CompTemplateSection["side"],
                )
              }
              className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-300"
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="full">Full Width</option>
            </select>
            <button
              type="button"
              onClick={() => addRow(si)}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
            >
              + Row
            </button>
            <button
              type="button"
              onClick={() => removeSection(si)}
              className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300"
            >
              Remove
            </button>
          </div>

          <div className="space-y-1.5">
            {section.rows.map((row, ri) => (
              <div
                key={`row-${si}-${ri}`}
                className="flex items-center gap-2"
              >
                <select
                  value={row.fieldKey}
                  onChange={(e) => updateRow(si, ri, e.target.value)}
                  className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100"
                >
                  <option value="">-- Select field --</option>
                  {row.fieldKey &&
                    !availableKeys.includes(row.fieldKey) && (
                      <option value={row.fieldKey}>
                        {row.fieldKey}
                      </option>
                    )}
                  {availableKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeRow(si, ri)}
                  className="flex-shrink-0 rounded px-1.5 py-1 text-sm text-red-400 hover:bg-red-900/30 hover:text-red-300"
                  title="Remove row"
                >
                  &minus;
                </button>
              </div>
            ))}
            {section.rows.length === 0 && (
              <p className="py-1 text-xs italic text-gray-500">
                No rows. Click &ldquo;+ Row&rdquo; to add one.
              </p>
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={addSection}
          className="rounded border border-dashed border-gray-600 px-3 py-1.5 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300"
        >
          + Add Section
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving\u2026" : "Save Template"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export interface CompUITemplateProps {
  projectId: string;
  compType: CompUITemplateType;
  typeSlug: string;
}

export function CompUITemplate({
  projectId,
  compType,
  typeSlug,
}: CompUITemplateProps) {
  const searchParams = useSearchParams();
  const { project, isLoading: projectLoading } = useProject(projectId);

  const [editMode, setEditMode] = useState(false);
  const [salesVariant, setSalesVariant] = useState<SalesVariant>("default");
  const [editSections, setEditSections] = useState<CompTemplateSection[]>([]);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const templateKey = templateKeyForType(compType, salesVariant);
  const { store, isLoaded: templatesLoaded, saveTemplate } =
    useCompTemplates(projectId);

  const comparables = useMemo(() => {
    if (!project) return [];
    return project.comparables.filter((c) => c.type === compType);
  }, [project, compType]);

  const compIds = useMemo(() => comparables.map((c) => c.id), [comparables]);

  const { dataMap, isLoading: parsedLoading } =
    useCompsParsedDataBatch(compIds);

  const sections = useMemo(() => {
    if (!templatesLoaded) return getDefaultSections(templateKey);
    return store[templateKey] ?? getDefaultSections(templateKey);
  }, [templatesLoaded, store, templateKey]);

  const availableKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const raw of Object.values(dataMap)) {
      for (const k of Object.keys(raw)) {
        if (!k.startsWith("_")) keys.add(k);
      }
    }
    for (const section of getDefaultSections(templateKey)) {
      for (const row of section.rows) {
        if (row.fieldKey) keys.add(row.fieldKey);
      }
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [dataMap, templateKey]);

  // Scroll to comp from URL search param
  useEffect(() => {
    const compId = searchParams.get("compId");
    if (!compId || editMode) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`comp-render-${compId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchParams, editMode]);

  const enterEditMode = useCallback(() => {
    setEditSections(JSON.parse(JSON.stringify(sections)) as CompTemplateSection[]);
    setEditMode(true);
  }, [sections]);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setEditSections([]);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveTemplate(templateKey, editSections);
      setEditMode(false);
    } catch (err) {
      console.error("Failed to save template", err);
    } finally {
      setSaving(false);
    }
  }, [saveTemplate, templateKey, editSections]);

  const handleCopy = useCallback(async () => {
    const el = printRef.current;
    if (!el) return;
    try {
      const html = el.innerHTML;
      const plainText = el.innerText;
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([plainText], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback("Copy failed");
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, []);

  const scrollToComp = useCallback((compId: string) => {
    const el = document.getElementById(`comp-render-${compId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (projectLoading || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-gray-400">Loading project&hellip;</p>
      </div>
    );
  }

  const firstCompRaw =
    comparables.length > 0 ? (dataMap[comparables[0]!.id] ?? {}) : {};

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-gray-100">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* ---- Toolbar ---- */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
          {/* Jump-to selector (render mode only) */}
          {!editMode && comparables.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Jump to:</span>
              <select
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
                onChange={(e) => scrollToComp(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>
                  Select comp&hellip;
                </option>
                {comparables.map((c, i) => (
                  <option key={c.id} value={c.id}>
                    #{i + 1}
                    {c.address ? ` \u2014 ${c.address}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Sales variant toggle */}
          {compType === "Sales" && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Variant:</span>
              <select
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
                value={salesVariant}
                onChange={(e) => {
                  setSalesVariant(e.target.value as SalesVariant);
                  if (editMode) exitEditMode();
                }}
              >
                <option value="default">Default</option>
                <option value="income">Income</option>
              </select>
            </label>
          )}

          <div className="flex-1" />

          {!editMode ? (
            <>
              <button
                type="button"
                onClick={enterEditMode}
                className="rounded border border-gray-600 px-4 py-1.5 text-sm text-gray-300 transition hover:border-gray-500 hover:text-gray-100"
              >
                Edit Template
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={comparables.length === 0}
                className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
              >
                Copy All
              </button>
              {copyFeedback && (
                <span className="text-sm text-green-400">
                  {copyFeedback}
                </span>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={exitEditMode}
              className="rounded border border-gray-600 px-4 py-1.5 text-sm text-gray-300 transition hover:border-gray-500 hover:text-gray-100"
            >
              Done Editing
            </button>
          )}
        </div>

        {parsedLoading && (
          <p className="text-sm text-gray-500">Loading comp data&hellip;</p>
        )}

        {/* ---- Edit Mode ---- */}
        {editMode && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Template Configuration
              </h3>
              <TemplateEditor
                sections={editSections}
                onChange={setEditSections}
                onSave={() => void handleSave()}
                onCancel={exitEditMode}
                availableKeys={availableKeys}
                saving={saving}
              />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Live Preview (Comp #1)
              </h3>
              {comparables[0] ? (
                <CompRendered
                  comp={comparables[0]}
                  index={0}
                  compType={compType}
                  rawData={firstCompRaw}
                  sections={editSections}
                />
              ) : (
                <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-700 text-sm text-gray-500">
                  No comparables to preview.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- Render Mode: All Comps ---- */}
        {!editMode && (
          <div ref={printRef} className="space-y-8">
            {comparables.map((comp, i) => (
              <CompRendered
                key={comp.id}
                comp={comp}
                index={i}
                compType={compType}
                rawData={dataMap[comp.id] ?? {}}
                sections={sections}
              />
            ))}
            {comparables.length === 0 && !parsedLoading && (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-700 text-sm text-gray-500">
                No {typeSlug.replace("-", " ")} comparables found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
