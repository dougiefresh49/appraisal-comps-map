"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSubjectData } from "~/hooks/useSubjectData";
import { useProject } from "~/hooks/useProject";
import { DEFAULT_APPROACHES } from "~/utils/projectStore";
import type {
  ExpenseStructure,
  SubjectData,
  SubjectTax,
  FemaData,
} from "~/types/comp-data";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import {
  PushToSheetButton,
  type PushToSheetButtonHandle,
} from "~/components/PushToSheetButton";
import { ExportJsonDialog } from "~/components/ExportJsonDialog";
import { ToggleField } from "~/components/ToggleField";
import { DataMergeDialog } from "~/components/DataMergeDialog";
import {
  ArrowDownOnSquareIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import {
  PROPERTY_RIGHTS_OPTIONS,
  FRONTAGE_OPTIONS,
  UTILITIES_STATUS_OPTIONS,
  WASH_BAY_OPTIONS,
  EXPENSE_STRUCTURE_OPTIONS,
} from "~/types/comp-field-options";
import {
  acToSf,
  sfToAc,
  getZoneVal,
  formatAddressLabel,
  formatAddressLocal,
  officePercent,
  floorAreaRatio,
  landBldRatio,
  parkingRatio,
  rentPerSfPerYear,
  totalTaxes,
  estExpenses,
} from "~/lib/calculated-fields";

interface SubjectDataEditorProps {
  projectId: string;
}

type CoreData = Partial<SubjectData> & Record<string, unknown>;

function fmtDisplayPercent(val: number | null | undefined): string | null {
  return val != null && !Number.isNaN(val)
    ? (val * 100).toFixed(1) + "%"
    : null;
}

function fmtDisplayCurrency(val: number | null | undefined): string | null {
  if (val == null || Number.isNaN(val)) return null;
  return (
    "$" +
    val.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtDisplayRatio(val: number | null | undefined): string | null {
  return val != null && !Number.isNaN(val) ? val.toFixed(2) : null;
}

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

function ComputedField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <div className="w-full rounded-md border border-gray-700/50 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-300">
        {value != null && value !== "" ? String(value) : "—"}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900" +
        (className ? ` ${className}` : "")
      }
    >
      <h3 className="mb-4 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function SubjectDataEditor({ projectId }: SubjectDataEditorProps) {
  const { project } = useProject(projectId);
  const showIncomeLease = (project?.approaches ?? DEFAULT_APPROACHES).income;

  const { subjectData, isLoading, error, saveSubjectData } =
    useSubjectData(projectId);

  const [core, setCore] = useState<CoreData>({});
  const [fema, setFema] = useState<FemaData>({});
  const [taxes, setTaxes] = useState<SubjectTax[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [isRebuildLoading, setIsRebuildLoading] = useState(false);
  const [rebuildError, setRebuildError] = useState<string | null>(null);
  const [pendingRebuildData, setPendingRebuildData] = useState<{
    currentCore: Record<string, unknown>;
    proposedCore: Record<string, unknown>;
    currentFema: Record<string, unknown>;
    proposedFema: Record<string, unknown>;
  } | null>(null);

  const pushToSheetRef = useRef<PushToSheetButtonHandle>(null);
  const actionsMenuWrapRef = useRef<HTMLDivElement>(null);
  const pushFeedbackClearRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearPushFeedbackTimer = useCallback(() => {
    if (pushFeedbackClearRef.current) {
      clearTimeout(pushFeedbackClearRef.current);
      pushFeedbackClearRef.current = null;
    }
  }, []);

  const handlePushStatusChange = useCallback(
    ({
      status,
      errorMessage,
    }: {
      status: "idle" | "pushing" | "success" | "error";
      errorMessage: string | null;
    }) => {
      clearPushFeedbackTimer();
      if (status === "pushing") {
        setPushFeedback(null);
        return;
      }
      if (status === "success") {
        setPushFeedback({ kind: "ok", text: "Pushed to sheet" });
        pushFeedbackClearRef.current = setTimeout(() => {
          setPushFeedback(null);
        }, 3000);
        return;
      }
      if (status === "error" && errorMessage) {
        setPushFeedback({ kind: "err", text: errorMessage });
        pushFeedbackClearRef.current = setTimeout(() => {
          setPushFeedback(null);
        }, 6000);
        return;
      }
      if (status === "idle") setPushFeedback(null);
    },
    [clearPushFeedbackTimer],
  );

  useEffect(() => {
    return () => {
      clearPushFeedbackTimer();
    };
  }, [clearPushFeedbackTimer]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        actionsMenuWrapRef.current &&
        !actionsMenuWrapRef.current.contains(e.target as Node)
      ) {
        setActionsMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionsMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsMenuOpen]);

  useEffect(() => {
    if (subjectData) {
      setCore(subjectData.core as CoreData);
      setFema(subjectData.fema ?? {});
      setTaxes(subjectData.taxes);
    }
  }, [subjectData]);

  const updateCore = useCallback((key: string, value: unknown) => {
    setCore((prev) => ({ ...prev, [key]: value }));
  }, []);

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

  const handleRebuildFromDocuments = async () => {
    setIsRebuildLoading(true);
    setRebuildError(null);
    try {
      const res = await fetch("/api/subjects/reparse-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Rebuild preview failed");
      }
      const data = (await res.json()) as {
        currentCore: Record<string, unknown>;
        proposedCore: Record<string, unknown>;
        currentFema: Record<string, unknown>;
        proposedFema: Record<string, unknown>;
        documentCount: number;
      };
      if (data.documentCount === 0) {
        setRebuildError("No processed documents found for this project.");
        return;
      }
      setPendingRebuildData({
        currentCore: data.currentCore,
        proposedCore: data.proposedCore,
        currentFema: data.currentFema,
        proposedFema: data.proposedFema,
      });
    } catch (err) {
      setRebuildError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setIsRebuildLoading(false);
    }
  };

  const actionsDisabled = isLoading;

  return (
    <div className="space-y-6">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex w-full min-w-0 flex-row items-start gap-2 md:w-1/2 md:max-w-[50%] md:flex-col md:gap-0 md:pr-4">
          <div className="w-3/4 min-w-0 md:w-full">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Subject Overview
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Edit subject property data, zoning, utilities, and tax
              information.
            </p>
          </div>
          <div
            className="relative flex w-1/4 shrink-0 justify-end self-start pt-0.5 md:hidden"
            ref={actionsMenuWrapRef}
          >
            <button
              type="button"
              onClick={() => setActionsMenuOpen((o) => !o)}
              disabled={actionsDisabled}
              aria-expanded={actionsMenuOpen}
              aria-haspopup="menu"
              title="Actions"
              aria-label="Open actions menu"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-800/80 text-gray-300 transition hover:border-gray-600 hover:bg-gray-700/60 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 disabled:opacity-50 dark:border-gray-700"
            >
              <EllipsisVerticalIcon className="h-4 w-4" aria-hidden />
            </button>
            {actionsMenuOpen && (
              <ul
                className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl dark:bg-gray-900"
                role="menu"
                aria-orientation="vertical"
              >
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setIsDocPanelOpen(true);
                    }}
                  >
                    <DocumentTextIcon
                      className="h-4 w-4 shrink-0 text-gray-400"
                      aria-hidden
                    />
                    Documents
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={actionsDisabled || isRebuildLoading}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      void handleRebuildFromDocuments();
                    }}
                  >
                    <ArrowPathIcon
                      className={`h-4 w-4 shrink-0 text-blue-400${isRebuildLoading ? " animate-spin" : ""}`}
                      aria-hidden
                    />
                    Rebuild from Documents
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={actionsDisabled}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setIsExportDialogOpen(true);
                    }}
                  >
                    <ArrowDownTrayIcon
                      className="h-4 w-4 shrink-0 text-violet-400"
                      aria-hidden
                    />
                    Export JSON
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={actionsDisabled || isSaving}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      pushToSheetRef.current?.openConfirm();
                    }}
                  >
                    <ArrowUpTrayIcon
                      className="h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden
                    />
                    Push to Sheet
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={actionsDisabled || isSaving}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      void handleSave();
                    }}
                  >
                    {isSaving ? (
                      <ArrowPathIcon
                        className="h-4 w-4 shrink-0 animate-spin text-blue-400"
                        aria-hidden
                      />
                    ) : (
                      <ArrowDownOnSquareIcon
                        className="h-4 w-4 shrink-0 text-blue-400"
                        strokeWidth={2}
                        aria-hidden
                      />
                    )}
                    Save changes
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
          {(saveSuccess || saveError != null || pushFeedback != null) && (
            <div className="flex max-w-full flex-col items-end gap-1 text-right text-xs sm:text-sm">
              {saveSuccess && (
                <span className="font-medium text-green-600 dark:text-green-400">
                  Saved
                </span>
              )}
              {saveError && (
                <span className="text-red-600 dark:text-red-400">
                  {saveError}
                </span>
              )}
              {pushFeedback?.kind === "ok" && (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {pushFeedback.text}
                </span>
              )}
              {pushFeedback?.kind === "err" && (
                <span className="text-red-600 dark:text-red-400">
                  {pushFeedback.text}
                </span>
              )}
            </div>
          )}
          <div className="hidden md:flex md:flex-wrap md:items-center md:justify-end md:gap-1.5">
            <DocumentPanelToggle
              variant="icon"
              onClick={() => setIsDocPanelOpen(true)}
            />
            <button
              type="button"
              onClick={() => void handleRebuildFromDocuments()}
              disabled={actionsDisabled || isRebuildLoading}
              title="Rebuild subject data from processed documents"
              aria-label="Rebuild from Documents"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800/80 px-3 text-xs font-medium text-gray-300 transition hover:border-blue-700 hover:bg-blue-950/30 hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
            >
              {isRebuildLoading ? (
                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden />
              )}
              Rebuild
            </button>
            <button
              type="button"
              onClick={() => setIsExportDialogOpen(true)}
              disabled={actionsDisabled}
              title="Export data as JSON for AppScript importer"
              aria-label="Export JSON"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-800/80 text-gray-300 transition hover:border-violet-700 hover:bg-violet-950/30 hover:text-violet-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
            >
              <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
            </button>
            <PushToSheetButton
              ref={pushToSheetRef}
              iconOnly
              showInlineFeedback={false}
              onStatusChange={handlePushStatusChange}
              confirmDescription="subject property data to row 2 of the 'subject' sheet"
              confirmDetail="Fields from the core subject data object will be matched to column headers dynamically."
              disabled={actionsDisabled}
              onPush={async () => {
                const res = await fetch("/api/spreadsheet/push-subject", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ projectId }),
                });
                if (!res.ok) {
                  const data = (await res.json()) as { error?: string };
                  throw new Error(data.error ?? "Push failed");
                }
              }}
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={actionsDisabled || isSaving}
              title={isSaving ? "Saving…" : "Save changes"}
              aria-label={isSaving ? "Saving…" : "Save changes"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {isSaving ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowDownOnSquareIcon
                  className="h-4 w-4"
                  strokeWidth={2}
                  aria-hidden
                />
              )}
            </button>
          </div>
        </div>
      </header>
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          Loading subject data...
        </div>
      )}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {!isLoading && !error ? (
        <>
          {/* Masonry-style columns (avoids tall empty space next to short cards) */}
          <div className="columns-1 gap-x-4 [column-fill:balance] md:columns-2">
            {/* Property Info */}
            <SectionCard
              title="Property Info"
              className="mb-4 w-full break-inside-avoid"
            >
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
              <SelectField
                label="Property Rights"
                value={core["Property Rights"]}
                options={PROPERTY_RIGHTS_OPTIONS.map((o) => ({
                  label: o,
                  value: o,
                }))}
                onChange={(v) => updateCore("Property Rights", v)}
              />
              <FormField
                label="Property Type"
                value={core["Property Type"] as string | undefined}
                onChange={(v) => updateCore("Property Type", v || null)}
              />
              <FormField
                label="Property Type Long"
                value={core["Property Type Long"] as string | undefined}
                onChange={(v) => updateCore("Property Type Long", v || null)}
              />
              <FormField
                label="Instrument Number"
                value={core.instrumentNumber}
                onChange={(v) => updateCore("instrumentNumber", v || null)}
              />
              <ComputedField
                label="AddressLabel"
                value={formatAddressLabel(
                  core.Address,
                  core.City,
                  core.State,
                  core.Zip as string | number | null | undefined,
                )}
              />
              <ComputedField
                label="AddressLocal"
                value={formatAddressLocal(
                  core.Address,
                  core.City,
                  core.County,
                  core.State,
                  core.Zip as string | number | null | undefined,
                )}
              />
            </SectionCard>

            {/* Zoning & Location */}
            <SectionCard
              title="Zoning & Location"
              className="mb-4 w-full break-inside-avoid"
            >
              <FormField
                label="Zoning Area"
                value={core["Zoning Area"]}
                onChange={(v) => updateCore("Zoning Area", v)}
              />
              <FormField
                label="Zoning Description"
                value={core["Zoning Description"]}
                onChange={(v) => updateCore("Zoning Description", v)}
              />
              <ComputedField
                label="Zoning"
                value={getZoneVal(
                  core["Zoning Area"],
                  core["Zoning Description"],
                )}
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
              <SelectField
                label="Frontage"
                value={core.Frontage as string | null | undefined}
                options={FRONTAGE_OPTIONS.map((o) => ({ label: o, value: o }))}
                onChange={(v) => updateCore("Frontage", v || null)}
              />
            </SectionCard>

            {/* Physical */}
            <SectionCard
              title="Physical Characteristics"
              className="mb-4 w-full break-inside-avoid"
            >
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
                      updateCore(
                        "Land Size (AC)",
                        Math.round(computedAc * 1000) / 1000,
                      );
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
                  label="Office Area (SF)"
                  type="number"
                  value={core["Office Area (SF)"] as number | undefined}
                  onChange={(v) =>
                    updateCore("Office Area (SF)", v ? Number(v) : null)
                  }
                />
                <FormField
                  label="Warehouse Area (SF)"
                  type="number"
                  value={core["Warehouse Area (SF)"] as number | undefined}
                  onChange={(v) =>
                    updateCore("Warehouse Area (SF)", v ? Number(v) : null)
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <ComputedField
                  label="Office %"
                  value={fmtDisplayPercent(
                    officePercent(
                      core["Office Area (SF)"] as number | null | undefined,
                      core["Building Size (SF)"],
                    ),
                  )}
                />
                <ComputedField
                  label="Floor Area Ratio"
                  value={fmtDisplayRatio(
                    floorAreaRatio(
                      core["Building Size (SF)"],
                      core["Land Size (SF)"],
                    ),
                  )}
                />
                <ComputedField
                  label="Land / Bld Ratio"
                  value={fmtDisplayRatio(
                    landBldRatio(
                      core["Land Size (SF)"],
                      core["Building Size (SF)"],
                    ),
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Parking Spaces"
                  type="number"
                  value={core["Parking Spaces"] as number | undefined}
                  onChange={(v) =>
                    updateCore("Parking Spaces", v ? Number(v) : null)
                  }
                />
                <FormField
                  label="Parking Spaces Details"
                  value={core["Parking Spaces Details"] as string | undefined}
                  onChange={(v) =>
                    updateCore("Parking Spaces Details", v || null)
                  }
                />
              </div>
              <ComputedField
                label="Parking Ratio"
                value={fmtDisplayRatio(
                  parkingRatio(
                    core["Parking (SF)"],
                    core["Building Size (SF)"],
                  ),
                )}
              />
              <div className="grid grid-cols-3 gap-3">
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
                <FormField
                  label="Effective Age"
                  type="number"
                  value={core["Effective Age"] as number | undefined}
                  onChange={(v) =>
                    updateCore("Effective Age", v ? Number(v) : null)
                  }
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
            <SectionCard
              title="Utilities"
              className="mb-4 w-full break-inside-avoid"
            >
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
                  updateCore(
                    "Utils - Water",
                    (v || null) as "Public" | "Well" | "None" | null,
                  )
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
                  updateCore(
                    "Utils - Sewer",
                    (v || null) as "Public" | "Septic" | "None" | null,
                  )
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
                  updateCore(
                    "Surface",
                    (v || null) as "Cleared" | "Caliche" | "Raw" | null,
                  )
                }
              />
              <SelectField
                label="Overall Status"
                value={core.Utilities as string | null | undefined}
                options={UTILITIES_STATUS_OPTIONS.map((o) => ({
                  label: o,
                  value: o,
                }))}
                onChange={(v) => updateCore("Utilities", v ? v : null)}
              />
            </SectionCard>

            <SectionCard
              title="Property Features"
              className="mb-4 w-full break-inside-avoid"
            >
              <FormField
                label="Other Features"
                value={core["Other Features"] as string | undefined}
                onChange={(v) => updateCore("Other Features", v || null)}
              />
              <SelectField
                label="Wash Bay"
                value={
                  core["Wash Bay"] === true
                    ? "Yes"
                    : core["Wash Bay"] === false
                      ? "No"
                      : ""
                }
                options={WASH_BAY_OPTIONS.map((o) => ({ label: o, value: o }))}
                onChange={(v) =>
                  updateCore(
                    "Wash Bay",
                    v === "Yes" ? true : v === "No" ? false : null,
                  )
                }
              />
              <FormField
                label="Hoisting"
                value={core.Hoisting as string | undefined}
                onChange={(v) => updateCore("Hoisting", v || null)}
              />
            </SectionCard>

            {showIncomeLease ? (
              <SectionCard
                title="Income / Lease"
                className="mb-4 w-full break-inside-avoid"
              >
                <FormField
                  label="Tenant"
                  value={core.Tenant as string | undefined}
                  onChange={(v) => updateCore("Tenant", v || null)}
                />
                <FormField
                  label="Lease Start"
                  value={core["Lease Start"] as string | undefined}
                  onChange={(v) => updateCore("Lease Start", v || null)}
                />
                <FormField
                  label="Rent / Month"
                  type="number"
                  value={core["Rent / Month"] as number | undefined}
                  onChange={(v) =>
                    updateCore("Rent / Month", v ? Number(v) : null)
                  }
                />
                <ComputedField
                  label="Rent / SF / Year"
                  value={(() => {
                    const r = rentPerSfPerYear(
                      core["Rent / Month"] as number | null | undefined,
                      core["Building Size (SF)"],
                    );
                    return r != null ? r.toFixed(2) : null;
                  })()}
                />
                <SelectField
                  label="Expense Structure"
                  value={core["Expense Structure"] as string | undefined}
                  options={EXPENSE_STRUCTURE_OPTIONS.map((o) => ({
                    label: o,
                    value: o,
                  }))}
                  onChange={(v) =>
                    updateCore(
                      "Expense Structure",
                      (v || null) as ExpenseStructure | null,
                    )
                  }
                />
                <FormField
                  label="Occupancy %"
                  value={core["Occupancy %"] as string | undefined}
                  onChange={(v) => updateCore("Occupancy %", v || null)}
                />
                <FormField
                  label="Post Sale Renovation Cost"
                  type="number"
                  value={
                    core["Post Sale Renovation Cost"] as number | undefined
                  }
                  onChange={(v) =>
                    updateCore(
                      "Post Sale Renovation Cost",
                      v ? Number(v) : null,
                    )
                  }
                />
              </SectionCard>
            ) : null}

            <SectionCard
              title="Computed Summary"
              className="mb-4 w-full break-inside-avoid"
            >
              <FormField
                label="Size Multiplier"
                type="number"
                value={core["Size Multiplier"] as number | undefined}
                placeholder="1"
                onChange={(v) =>
                  updateCore("Size Multiplier", v ? Number(v) : null)
                }
              />
              <ComputedField
                label="Total Taxes"
                value={fmtDisplayCurrency(
                  totalTaxes(
                    taxes,
                    (core["Size Multiplier"] as number | null | undefined) ?? 1,
                  ),
                )}
              />
              <FormField
                label="County Appraised Value"
                type="number"
                value={core["County Appraised Value"] as number | undefined}
                onChange={(v) =>
                  updateCore("County Appraised Value", v ? Number(v) : null)
                }
              />
              <FormField
                label="Est Insurance"
                type="number"
                value={core["Est Insurance"]}
                onChange={(v) =>
                  updateCore("Est Insurance", v ? Number(v) : null)
                }
              />
              <ComputedField
                label="Est Expenses"
                value={fmtDisplayCurrency(
                  estExpenses(
                    core["Est Insurance"],
                    totalTaxes(
                      taxes,
                      (core["Size Multiplier"] as number | null | undefined) ??
                        1,
                    ),
                  ),
                )}
              />
              <ComputedField label="Market Conditions" value="Current" />
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
        </>
      ) : null}

      <DocumentContextPanel
        projectId={projectId}
        sectionKey="subject"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
      />
      <ExportJsonDialog
        projectId={projectId}
        context="subject"
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
      />

      {/* Rebuild error inline toast */}
      {rebuildError && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-red-800 bg-red-950 px-4 py-3 shadow-xl">
          <p className="text-sm text-red-300">{rebuildError}</p>
          <button
            type="button"
            onClick={() => setRebuildError(null)}
            className="text-red-400 hover:text-red-200"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Rebuild from Documents — merge dialog */}
      {pendingRebuildData && (
        <DataMergeDialog
          isOpen
          title="Rebuild from Documents — Review Changes"
          currentData={pendingRebuildData.currentCore}
          proposedData={pendingRebuildData.proposedCore}
          onConfirm={async (mergedCore) => {
            await saveSubjectData({
              core: mergedCore as unknown as SubjectData,
              fema: pendingRebuildData.proposedFema as FemaData,
            });
            setCore(mergedCore as CoreData);
            setPendingRebuildData(null);
          }}
          onCancel={() => setPendingRebuildData(null)}
        />
      )}
    </div>
  );
}
