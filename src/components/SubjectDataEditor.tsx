"use client";

import { useState, useCallback, useEffect } from "react";
import { useSubjectData } from "~/hooks/useSubjectData";
import type { SubjectData, SubjectTax, FemaData } from "~/types/comp-data";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import { acToSf, sfToAc } from "~/lib/calculated-fields";

interface SubjectDataEditorProps {
  projectId: string;
}

type CoreData = Partial<SubjectData>;

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: "text" | "number";
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
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
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function SubjectDataEditor({ projectId }: SubjectDataEditorProps) {
  const { subjectData, isLoading, error, saveSubjectData } =
    useSubjectData(projectId);

  const [core, setCore] = useState<CoreData>({});
  const [fema, setFema] = useState<FemaData>({});
  const [taxes, setTaxes] = useState<SubjectTax[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);

  useEffect(() => {
    if (subjectData) {
      setCore(subjectData.core as CoreData);
      setFema(subjectData.fema ?? {});
      setTaxes(subjectData.taxes);
    }
  }, [subjectData]);

  const updateCore = useCallback(
    <K extends keyof CoreData>(key: K, value: CoreData[K]) => {
      setCore((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveSubjectData({ core: core as SubjectData, fema, taxes });
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
        Loading subject data...
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
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Edit subject property information.
        </p>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              Saved
            </span>
          )}
          {saveError && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {saveError}
            </span>
          )}
          <DocumentPanelToggle onClick={() => setIsDocPanelOpen(true)} />
          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Property Info */}
        <SectionCard title="Property Info">
          <FormField
            label="Address"
            value={core.Address}
            onChange={(v) => updateCore("Address", v)}
            placeholder="123 Main St"
          />
          <FormField
            label="APN"
            value={core.APN}
            onChange={(v) => updateCore("APN", v || null)}
          />
          <FormField
            label="Legal Description"
            value={core.Legal}
            onChange={(v) => updateCore("Legal", v || null)}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="City"
              value={core.City}
              onChange={(v) => updateCore("City", v)}
            />
            <FormField
              label="State"
              value={core.State}
              onChange={(v) => updateCore("State", v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Zip"
              value={core.Zip}
              onChange={(v) => updateCore("Zip", v)}
            />
            <FormField
              label="County"
              value={core.County}
              onChange={(v) => updateCore("County", v)}
            />
          </div>
        </SectionCard>

        {/* Zoning & Location */}
        <SectionCard title="Zoning & Location">
          <FormField
            label="Zoning"
            value={core.Zoning}
            onChange={(v) => updateCore("Zoning", v || null)}
          />
          <FormField
            label="Zoning Description"
            value={core["Zoning Description"]}
            onChange={(v) => updateCore("Zoning Description", v)}
          />
          <FormField
            label="Zoning Area"
            value={core["Zoning Area"]}
            onChange={(v) => updateCore("Zoning Area", v)}
          />
          <ToggleField
            label="Corner Lot"
            value={core.Corner}
            onChange={(v) => updateCore("Corner", v)}
          />
          <ToggleField
            label="Highway Frontage"
            value={core["Highway Frontage"]}
            onChange={(v) => updateCore("Highway Frontage", v)}
          />
        </SectionCard>

        {/* Physical */}
        <SectionCard title="Physical Characteristics">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Land Size (AC)"
              type="number"
              value={core["Land Size (AC)"]}
              onChange={(v) => {
                const ac = v ? Number(v) : null;
                updateCore("Land Size (AC)", ac);
                const computedSf = acToSf(ac);
                if (computedSf != null) {
                  updateCore("Land Size (SF)", computedSf);
                }
              }}
            />
            <FormField
              label="Land Size (SF)"
              type="number"
              value={core["Land Size (SF)"]}
              onChange={(v) => {
                const sf = v ? Number(v) : null;
                updateCore("Land Size (SF)", sf);
                const computedAc = sfToAc(sf);
                if (computedAc != null) {
                  updateCore("Land Size (AC)", Math.round(computedAc * 1000) / 1000);
                }
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Building Size (SF)"
              type="number"
              value={core["Building Size (SF)"]}
              onChange={(v) =>
                updateCore("Building Size (SF)", v ? Number(v) : null)
              }
            />
            <FormField
              label="Parking (SF)"
              type="number"
              value={core["Parking (SF)"]}
              onChange={(v) =>
                updateCore("Parking (SF)", v ? Number(v) : null)
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Year Built"
              type="number"
              value={core["Year Built"]}
              onChange={(v) =>
                updateCore("Year Built", v ? Number(v) : null)
              }
            />
            <FormField
              label="Age"
              type="number"
              value={core.Age}
              onChange={(v) => updateCore("Age", v ? Number(v) : null)}
            />
          </div>
          <SelectField
            label="Condition"
            value={core.Condition}
            options={[
              { label: "Good", value: "Good" },
              { label: "Average", value: "Average" },
              { label: "Fair", value: "Fair" },
              { label: "Poor", value: "Poor" },
            ]}
            onChange={(v) =>
              updateCore(
                "Condition",
                v as "Good" | "Average" | "Fair" | "Poor",
              )
            }
          />
          <FormField
            label="Construction"
            value={core.Construction}
            onChange={(v) => updateCore("Construction", v || null)}
          />
        </SectionCard>

        {/* Utilities */}
        <SectionCard title="Utilities">
          <ToggleField
            label="Electricity"
            value={core["Utils - Electricity"] ?? false}
            onChange={(v) => updateCore("Utils - Electricity", v)}
          />
          <SelectField
            label="Water"
            value={core["Utils - Water"]}
            options={[
              { label: "Public", value: "Public" },
              { label: "Well", value: "Well" },
              { label: "None", value: "None" },
            ]}
            onChange={(v) =>
              updateCore("Utils - Water", (v || null) as "Public" | "Well" | "None" | null)
            }
          />
          <SelectField
            label="Sewer"
            value={core["Utils - Sewer"]}
            options={[
              { label: "Public", value: "Public" },
              { label: "Septic", value: "Septic" },
              { label: "None", value: "None" },
            ]}
            onChange={(v) =>
              updateCore("Utils - Sewer", (v || null) as "Public" | "Septic" | "None" | null)
            }
          />
          <SelectField
            label="Surface"
            value={core.Surface}
            options={[
              { label: "Cleared", value: "Cleared" },
              { label: "Caliche", value: "Caliche" },
              { label: "Raw", value: "Raw" },
            ]}
            onChange={(v) =>
              updateCore("Surface", (v || null) as "Cleared" | "Caliche" | "Raw" | null)
            }
          />
        </SectionCard>
      </div>

      {/* FEMA Flood Data & Neighborhood Boundaries */}
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="FEMA Flood Data">
          <FormField
            label="FEMA Map Number"
            value={fema.FemaMapNum}
            onChange={(v) => setFema((prev) => ({ ...prev, FemaMapNum: v }))}
          />
          <FormField
            label="FEMA Zone"
            value={fema.FemaZone}
            onChange={(v) => setFema((prev) => ({ ...prev, FemaZone: v }))}
          />
          <SelectField
            label="Is Hazard Zone"
            value={
              fema.FemaIsHazardZone === true
                ? "true"
                : fema.FemaIsHazardZone === false
                  ? "false"
                  : undefined
            }
            options={[
              { label: "Yes", value: "true" },
              { label: "No", value: "false" },
            ]}
            onChange={(v) =>
              setFema((prev) => ({
                ...prev,
                FemaIsHazardZone:
                  v === "true" ? true : v === "false" ? false : null,
              }))
            }
          />
          <FormField
            label="FEMA Map Date"
            value={fema.FemaMapDate}
            onChange={(v) => setFema((prev) => ({ ...prev, FemaMapDate: v }))}
          />
        </SectionCard>

        <SectionCard title="Neighborhood Boundaries">
          <FormField
            label="North"
            value={((core as Record<string, unknown>).neighborhoodBoundaries as Record<string, string> | undefined)?.north}
            onChange={(v) =>
              setCore((prev) => ({
                ...prev,
                neighborhoodBoundaries: {
                  ...((prev as Record<string, unknown>).neighborhoodBoundaries as Record<string, string> ?? {}),
                  north: v,
                },
              } as CoreData))
            }
            placeholder="Northern boundary"
          />
          <FormField
            label="South"
            value={((core as Record<string, unknown>).neighborhoodBoundaries as Record<string, string> | undefined)?.south}
            onChange={(v) =>
              setCore((prev) => ({
                ...prev,
                neighborhoodBoundaries: {
                  ...((prev as Record<string, unknown>).neighborhoodBoundaries as Record<string, string> ?? {}),
                  south: v,
                },
              } as CoreData))
            }
            placeholder="Southern boundary"
          />
          <FormField
            label="East"
            value={((core as Record<string, unknown>).neighborhoodBoundaries as Record<string, string> | undefined)?.east}
            onChange={(v) =>
              setCore((prev) => ({
                ...prev,
                neighborhoodBoundaries: {
                  ...((prev as Record<string, unknown>).neighborhoodBoundaries as Record<string, string> ?? {}),
                  east: v,
                },
              } as CoreData))
            }
            placeholder="Eastern boundary"
          />
          <FormField
            label="West"
            value={((core as Record<string, unknown>).neighborhoodBoundaries as Record<string, string> | undefined)?.west}
            onChange={(v) =>
              setCore((prev) => ({
                ...prev,
                neighborhoodBoundaries: {
                  ...((prev as Record<string, unknown>).neighborhoodBoundaries as Record<string, string> ?? {}),
                  west: v,
                },
              } as CoreData))
            }
            placeholder="Western boundary"
          />
        </SectionCard>
      </div>

      {/* Taxes Section */}
      <SectionCard title="Tax Entities">
        <div className="space-y-2">
          {taxes.map((tax, i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                type="text"
                value={tax.Entity}
                onChange={(e) => {
                  const next = [...taxes];
                  next[i] = { ...next[i]!, Entity: e.target.value };
                  setTaxes(next);
                }}
                placeholder="Entity name"
                className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="number"
                value={tax.Amount}
                onChange={(e) => {
                  const next = [...taxes];
                  next[i] = { ...next[i]!, Amount: Number(e.target.value) };
                  setTaxes(next);
                }}
                placeholder="Amount"
                className="w-36 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => setTaxes(taxes.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTaxes([...taxes, { Entity: "", Amount: 0 }])}
            className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            + Add Row
          </button>
        </div>
      </SectionCard>

      <DocumentContextPanel
        projectId={projectId}
        sectionKey="subject"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
      />
    </div>
  );
}
