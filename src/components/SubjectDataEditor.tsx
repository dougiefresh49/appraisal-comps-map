"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSubjectData } from "~/hooks/useSubjectData";
import { useProject } from "~/hooks/useProject";
import { DEFAULT_APPROACHES } from "~/utils/projectStore";
import type {
  ExpenseStructure,
  FemaData,
  ParcelData,
  ParcelImprovement,
  SubjectData,
  SubjectTax,
} from "~/types/comp-data";
import { DocumentPanelToggle } from "~/components/DocumentContextPanel";
import { useDocumentPanel } from "~/components/DocumentPanelContext";
import { useTaskManagerMaybe } from "~/components/TaskManagerContext";
import {
  PushToSheetButton,
  type PushToSheetButtonHandle,
} from "~/components/PushToSheetButton";
import { ExportJsonDialog } from "~/components/ExportJsonDialog";
import { ToggleField } from "~/components/ToggleField";
import { DataMergeDialog } from "~/components/DataMergeDialog";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import { ParcelDataTable, parcelDataToRow, rowToParcelData } from "~/components/ParcelDataTable";
import { ParcelImprovementsTable, parcelImprovementToRow, rowToParcelImprovement } from "~/components/ParcelImprovementsTable";
import type { CompParcelPatch, CompParcelImprovementPatch } from "~/hooks/useCompParcels";
import {
  PROPERTY_RIGHTS_OPTIONS,
  FRONTAGE_OPTIONS,
  UTILITIES_STATUS_OPTIONS,
  WASH_BAY_OPTIONS,
  EXPENSE_STRUCTURE_OPTIONS,
  ZONING_LOCATION_OPTIONS,
  parseZoningLocation,
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
  calcAge,
  calcEffectiveAgeWeighted,
  parseYearsBuiltList,
  reportEffectiveYear,
} from "~/lib/calculated-fields";

interface SubjectDataEditorProps {
  projectId: string;
}

type CoreData = Partial<SubjectData> & Record<string, unknown>;

/** Same CSS hover pattern as PhotoGrid header icon buttons (`group` + absolutely positioned hint). */
const TOOLBAR_HOVER_HINT_CLASS =
  "pointer-events-none absolute top-full left-1/2 z-50 mt-2 max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded bg-gray-900 px-2 py-1.5 text-left text-xs leading-snug text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover:opacity-100";

function yearBuiltInputValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v;
  return "";
}

/** Persisted Age / Effective Age match sheet formulas; Age respects "Age Override". */
function applyComputedAgeFields(
  core: CoreData,
  effectiveDate?: string | null,
): CoreData {
  const refYear = reportEffectiveYear(effectiveDate ?? null);
  const years = parseYearsBuiltList(core["Year Built"]);
  const totalBld =
    typeof core["Building Size (SF)"] === "number" &&
    !Number.isNaN(core["Building Size (SF)"])
      ? core["Building Size (SF)"]
      : null;
  const computedEff = calcEffectiveAgeWeighted(
    years,
    refYear,
    undefined,
    totalBld,
  );
  const computedAge = calcAge(core["Year Built"], refYear);
  const ageOverride = core["Age Override"] === true;
  const effectiveAge =
    computedEff ??
    ((core["Effective Age"] as number | null | undefined) ?? null);
  return {
    ...core,
    Age: ageOverride ? (core.Age ?? null) : computedAge,
    "Effective Age": effectiveAge,
  };
}

function landSizeAcAsNumber(core: CoreData): number | null {
  const v = core["Land Size (AC)"] as unknown;
  if (v == null) return null;
  if (typeof v === "number") return !Number.isNaN(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.replace(/,/g, ""));
    return !Number.isNaN(n) ? n : null;
  }
  return null;
}

/** AC → SF (× 43,560) when acres are set — matches spreadsheet generated Land Size (SF). */
function normalizeLandSizeFromAc(core: CoreData): CoreData {
  const ac = landSizeAcAsNumber(core);
  if (ac != null) {
    const sf = acToSf(ac);
    if (sf != null) return { ...core, "Land Size (SF)": sf };
  }
  return core;
}

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

const FORM_FIELD_CONTROL_CLASS =
  "w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500";

function FormField({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: "text" | "number" | "textarea";
  placeholder?: string;
  /** Only used when `type="textarea"`. */
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </label>
      {type === "textarea" ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={rows}
          className={`${FORM_FIELD_CONTROL_CLASS} min-h-[5rem] resize-y`}
        />
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={FORM_FIELD_CONTROL_CLASS}
        />
      )}
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
      <div className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300">
        {value != null && value !== "" ? String(value) : "—"}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  className,
  isExpanded,
  onToggleExpand,
  expandLabel,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  expandLabel?: string;
}) {
  return (
    <div
      className={
        "rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900" +
        (className ? ` ${className}` : "")
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
          {title}
        </h3>
        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            title={
              isExpanded
                ? `Hide ${expandLabel ?? "detail"}`
                : `Show ${expandLabel ?? "detail"}`
            }
            className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition hover:bg-gray-100 dark:hover:bg-gray-800 ${
              isExpanded
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            <TableCellsIcon className="h-3.5 w-3.5" aria-hidden />
            {isExpanded ? "Hide" : (expandLabel ?? "Parcels")}
          </button>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function SubjectDataEditor({ projectId }: SubjectDataEditorProps) {
  const { project } = useProject(projectId);
  const showIncomeLease = (project?.approaches ?? DEFAULT_APPROACHES).income;

  const {
    subjectData,
    isLoading,
    error,
    saveSubjectData,
    clearProposedData,
    refreshSubjectData,
  } = useSubjectData(projectId);
  const taskManager = useTaskManagerMaybe();

  const [core, setCore] = useState<CoreData>({});
  const [fema, setFema] = useState<FemaData>({});
  const [taxes, setTaxes] = useState<SubjectTax[]>([]);
  const docPanel = useDocumentPanel();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [isRebuildLoading, setIsRebuildLoading] = useState(false);
  const [rebuildError, setRebuildError] = useState<string | null>(null);
  const [pendingRebuildData, setPendingRebuildData] = useState<{
    currentCore: Record<string, unknown>;
    proposedCore: Record<string, unknown>;
    currentFema: Record<string, unknown>;
    proposedFema: Record<string, unknown>;
    currentParcels: ParcelData[];
    proposedParcels: ParcelData[];
    currentImprovements: ParcelImprovement[];
    proposedImprovements: ParcelImprovement[];
  } | null>(null);
  const [showMergeReview, setShowMergeReview] = useState(false);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  const toggleSection = useCallback((title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Subject parcel / improvement mutations (write to subject_data JSONB arrays)
  // ---------------------------------------------------------------------------

  const handleParcelUpdate = useCallback(
    async (id: string, patch: CompParcelPatch) => {
      const currentParcels = subjectData?.parcels ?? [];
      const idx = parseInt(id.replace("subject-parcel-", ""), 10);
      if (isNaN(idx) || idx < 0 || idx >= currentParcels.length) return;
      const existing = currentParcels[idx];
      if (!existing) return;
      // Merge patch (snake_case) back onto the ParcelData (spreadsheet-key) shape
      const updatedRow = {
        ...parcelDataToRow(existing, idx),
        ...patch,
      };
      const updatedParcels = currentParcels.map((p, i) =>
        i === idx ? rowToParcelData(updatedRow) : p,
      );
      await saveSubjectData({ parcels: updatedParcels });
    },
    [subjectData, saveSubjectData],
  );

  const handleParcelDelete = useCallback(
    async (id: string) => {
      const currentParcels = subjectData?.parcels ?? [];
      const idx = parseInt(id.replace("subject-parcel-", ""), 10);
      if (isNaN(idx)) return;
      const updatedParcels = currentParcels.filter((_, i) => i !== idx);
      await saveSubjectData({ parcels: updatedParcels });
    },
    [subjectData, saveSubjectData],
  );

  const handleParcelAdd = useCallback(async () => {
    const currentParcels = subjectData?.parcels ?? [];
    const newParcel: ParcelData = {
      instrumentNumber: null,
      APN: "",
      "APN Link": "",
      Location: "",
      Legal: "",
      "Lot #": null,
      "Size (AC)": null,
      "Size (SF)": null,
      "Flood Zone": null,
      "Building Size (SF)": null,
      "Office Area (SF)": null,
      "Warehouse Area (SF)": null,
      "Storage Area (SF)": null,
      "Parking (SF)": null,
      Buildings: null,
      "Total Tax Amount": null,
    };
    await saveSubjectData({ parcels: [...currentParcels, newParcel] as ParcelData[] });
  }, [subjectData, saveSubjectData]);

  const handleImprovementUpdate = useCallback(
    async (id: string, patch: CompParcelImprovementPatch) => {
      const currentImps = subjectData?.improvements ?? [];
      const idx = parseInt(id.replace("subject-imp-", ""), 10);
      if (isNaN(idx) || idx < 0 || idx >= currentImps.length) return;
      const existing = currentImps[idx];
      if (!existing) return;
      const updatedRow = {
        ...parcelImprovementToRow(existing, idx),
        ...patch,
      };
      const updatedImps = currentImps.map((imp, i) =>
        i === idx ? rowToParcelImprovement(updatedRow) : imp,
      );
      await saveSubjectData({ improvements: updatedImps });
    },
    [subjectData, saveSubjectData],
  );

  const handleImprovementDelete = useCallback(
    async (id: string) => {
      const currentImps = subjectData?.improvements ?? [];
      const idx = parseInt(id.replace("subject-imp-", ""), 10);
      if (isNaN(idx)) return;
      const updatedImps = currentImps.filter((_, i) => i !== idx);
      await saveSubjectData({ improvements: updatedImps });
    },
    [subjectData, saveSubjectData],
  );

  const handleImprovementAdd = useCallback(async () => {
    const currentImps = subjectData?.improvements ?? [];
    const newImp: ParcelImprovement = {
      instrumentNumber: null,
      APN: "",
      "Building #": (currentImps.length) + 1,
      "Section #": 1,
      "Year Built": null,
      "Gross Building Area (SF)": null,
      "Office Area (SF)": null,
      "Warehouse Area (SF)": null,
      "Parking (SF)": null,
      "Storage Area (SF)": null,
      "Is GLA": true,
      Construction: "",
      Comments: null,
    };
    await saveSubjectData({
      improvements: [...currentImps, newImp] as ParcelImprovement[],
    });
  }, [subjectData, saveSubjectData]);

  const actionsMenuWrapRef = useRef<HTMLDivElement>(null);
  const pushToSheetRef = useRef<PushToSheetButtonHandle | null>(null);
  const mountedRef = useRef(true);
  const subjectDataRef = useRef(subjectData);
  subjectDataRef.current = subjectData;

  /** True after local edits; blocks hydrating from Supabase so realtime/load won't clobber drafts. */
  const dirtyRef = useRef(false);
  const coreRef = useRef<CoreData>({});
  const femaRef = useRef<FemaData>({});
  const taxesRef = useRef<SubjectTax[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  coreRef.current = core;
  femaRef.current = fema;
  taxesRef.current = taxes;

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
      if (!dirtyRef.current) {
        setCore(normalizeLandSizeFromAc(subjectData.core as CoreData));
        setFema(subjectData.fema ?? {});
        setTaxes(subjectData.taxes);
      }
    }
  }, [subjectData]);

  const updateCore = useCallback((key: string, value: unknown) => {
    dirtyRef.current = true;
    setCore((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** Persist core + fema + taxes (age/land normalization applied to core). */
  const persistCore = useCallback(async () => {
    if (!subjectData) return;
    const coreToSave = applyComputedAgeFields(
      normalizeLandSizeFromAc(coreRef.current),
      project?.effectiveDate,
    );
    await saveSubjectData({
      core: coreToSave as SubjectData,
      fema: femaRef.current,
      taxes: taxesRef.current,
    });
    dirtyRef.current = false;
    if (mountedRef.current) {
      setCore(coreToSave);
    }
  }, [subjectData, saveSubjectData, project?.effectiveDate]);

  const persistCoreRef = useRef(persistCore);
  persistCoreRef.current = persistCore;

  /** Clear debounce and write dirty data now (field blur, tab hide, unmount). */
  const saveNow = useCallback(() => {
    if (!dirtyRef.current || !subjectDataRef.current) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    void persistCoreRef.current().catch(() => {
      void 0;
    });
  }, []);

  /** After discrete commits (select/toggle), wait for React to flush state so refs match. */
  const scheduleSaveNow = useCallback(() => {
    window.setTimeout(() => {
      saveNow();
    }, 0);
  }, [saveNow]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveNow();
    };
  }, [saveNow]);

  /* Backup autosave if a programmatic edit sets dirty without blur (rare). */
  useEffect(() => {
    if (!subjectData || isLoading) return;
    if (!dirtyRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      if (!dirtyRef.current) return;
      void persistCore().catch(() => {
        void 0;
      });
    }, 2000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [core, taxes, subjectData, isLoading, persistCore]);

  /* Tab / window hide */
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== "hidden") return;
      saveNow();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [saveNow]);

  useEffect(() => {
    const onPageHide = () => {
      saveNow();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [saveNow]);

  const refYear = useMemo(
    () => reportEffectiveYear(project?.effectiveDate ?? null),
    [project?.effectiveDate],
  );

  const yearBuiltForAge = core["Year Built"];
  const buildingSfForEffectiveAge = core["Building Size (SF)"];
  const subjectLandAc = landSizeAcAsNumber(core);

  const displayChronologicalAge = useMemo(
    () => calcAge(yearBuiltForAge, refYear),
    [yearBuiltForAge, refYear],
  );

  const displayEffectiveAge = useMemo(() => {
    const years = parseYearsBuiltList(yearBuiltForAge);
    const totalBld =
      typeof buildingSfForEffectiveAge === "number" &&
      !Number.isNaN(buildingSfForEffectiveAge)
        ? buildingSfForEffectiveAge
        : null;
    return calcEffectiveAgeWeighted(years, refYear, undefined, totalBld);
  }, [yearBuiltForAge, buildingSfForEffectiveAge, refYear]);

  /** When subject_data.parcels is empty, derive a single row from core so the table isn't blank. */
  const displayParcels: ParcelData[] = useMemo(() => {
    const dbParcels = subjectData?.parcels ?? [];
    if (dbParcels.length > 0) return dbParcels;
    const apn = typeof core.APN === "string" ? core.APN : undefined;
    if (!apn && !core.Address) return [];
    const cav = core["County Appraised Value"];
    const countyAppraised =
      cav === null || cav === undefined
        ? undefined
        : typeof cav === "string" || typeof cav === "number" || typeof cav === "boolean"
          ? String(cav)
          : typeof cav === "bigint"
            ? String(cav)
            : undefined;
    return [
      {
        instrumentNumber:
          typeof core.instrumentNumber === "string"
            ? core.instrumentNumber
            : null,
        APN: apn ?? "",
        "APN Link": "",
        Location: typeof core.Address === "string" ? core.Address : "",
        Legal: typeof core.Legal === "string" ? core.Legal : "",
        "Lot #": null,
        "Size (AC)": (core["Land Size (AC)"] as number | null) ?? null,
        "Size (SF)": (core["Land Size (SF)"] as number | null) ?? null,
        "Flood Zone": null,
        "Building Size (SF)":
          (core["Building Size (SF)"] as number | null) ?? null,
        "Office Area (SF)":
          (core["Office Area (SF)"] as number | null) ?? null,
        "Warehouse Area (SF)":
          (core["Warehouse Area (SF)"] as number | null) ?? null,
        "Storage Area (SF)": null,
        "Parking (SF)": (core["Parking (SF)"] as number | null) ?? null,
        Buildings: null,
        "Total Tax Amount": null,
        "County Appraised Value": countyAppraised,
      },
    ];
  }, [subjectData?.parcels, core]);

  /** When subject_data.improvements is empty, derive a single row from core. */
  const displayImprovements: ParcelImprovement[] = useMemo(() => {
    const dbImps = subjectData?.improvements ?? [];
    if (dbImps.length > 0) return dbImps;
    const bldSfRaw = core["Building Size (SF)"];
    const bldSf =
      typeof bldSfRaw === "number" && !Number.isNaN(bldSfRaw)
        ? bldSfRaw
        : null;
    if (!bldSf) return [];
    return [
      {
        instrumentNumber:
          typeof core.instrumentNumber === "string"
            ? core.instrumentNumber
            : null,
        APN: typeof core.APN === "string" ? core.APN : "",
        "Building #": 1,
        "Section #": 1,
        "Year Built":
          typeof core["Year Built"] === "number"
            ? core["Year Built"]
            : null,
        "Gross Building Area (SF)": bldSf ?? null,
        "Office Area (SF)":
          (core["Office Area (SF)"] as number | null) ?? null,
        "Warehouse Area (SF)":
          (core["Warehouse Area (SF)"] as number | null) ?? null,
        "Parking (SF)": (core["Parking (SF)"] as number | null) ?? null,
        "Storage Area (SF)": null,
        "Is GLA": true,
        Construction:
          typeof core.Construction === "string" ? core.Construction : "",
        Comments: null,
      },
    ];
  }, [subjectData?.improvements, core]);

  const handleRebuildFromDocuments = async () => {
    if (taskManager) {
      taskManager.addSubjectRebuildTask({
        projectId,
        label: "Subject rebuild",
      });
      return;
    }

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
        currentParcels?: ParcelData[];
        proposedParcels?: ParcelData[];
        currentImprovements?: ParcelImprovement[];
        proposedImprovements?: ParcelImprovement[];
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
        currentParcels: data.currentParcels ?? [],
        proposedParcels: data.proposedParcels ?? [],
        currentImprovements: data.currentImprovements ?? [],
        proposedImprovements: data.proposedImprovements ?? [],
      });
    } catch (err) {
      setRebuildError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setIsRebuildLoading(false);
    }
  };

  const isPendingReview =
    subjectData?.proposed_core != null ||
    subjectData?.proposed_parcels != null ||
    subjectData?.proposed_improvements != null;

  const handleStartReview = useCallback(async () => {
    await refreshSubjectData();
    setShowMergeReview(true);
  }, [refreshSubjectData]);

  const handleMergeConfirm = useCallback(
    async (mergedCombined: Record<string, unknown>) => {
      // Extract array fields from combined object, leaving scalar fields for core
      const { parcels: mergedParcels, improvements: mergedImprovements, ...coreOnly } =
        mergedCombined;
      const merged = applyComputedAgeFields(
        normalizeLandSizeFromAc(coreOnly as CoreData),
        project?.effectiveDate,
      );
      const mergedFema = subjectData?.proposed_fema ?? fema;
      await clearProposedData(
        merged,
        mergedFema,
        Array.isArray(mergedParcels) ? (mergedParcels as ParcelData[]) : undefined,
        Array.isArray(mergedImprovements)
          ? (mergedImprovements as ParcelImprovement[])
          : undefined,
      );
      dirtyRef.current = false;
      setCore(merged);
      setFema(mergedFema);
      setShowMergeReview(false);
    },
    [clearProposedData, subjectData?.proposed_fema, fema, project?.effectiveDate],
  );

  const handleMergeCancel = useCallback(async () => {
    await clearProposedData(
      (subjectData?.core ?? {}) as Record<string, unknown>,
      subjectData?.fema ?? {},
      subjectData?.parcels ?? [],
      subjectData?.improvements ?? [],
    );
    setShowMergeReview(false);
  }, [
    clearProposedData,
    subjectData?.core,
    subjectData?.fema,
    subjectData?.parcels,
    subjectData?.improvements,
  ]);

  const rebuildDisabled = isLoading || isRebuildLoading || isPendingReview;
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
              Edits save when you leave a field, change a dropdown or toggle, or
              leave the page. Supabase Realtime updates the row after each write.
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
              title="More actions: documents, rebuild, export JSON, push to sheet"
              aria-label="Open actions menu: documents, rebuild, export, push to sheet"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700/60 dark:hover:text-gray-100 dark:focus-visible:ring-gray-400/50"
            >
              <EllipsisVerticalIcon className="h-4 w-4" aria-hidden />
            </button>
            {actionsMenuOpen && (
              <ul
                className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
                role="menu"
                aria-orientation="vertical"
              >
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    title="Browse project documents for this section (deeds, CAD, engagement, etc.) and view extracted text or structured fields."
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      docPanel.open({ projectId, sectionKey: "subject" });
                    }}
                  >
                    <DocumentTextIcon
                      className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                      aria-hidden
                    />
                    Documents
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={rebuildDisabled}
                    title="Re-apply all processed documents to propose fresh subject field values. Opens a review dialog before anything is saved."
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-800"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      void handleRebuildFromDocuments();
                    }}
                  >
                    <ArrowPathIcon
                      className={`h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400${isRebuildLoading ? " animate-spin" : ""}`}
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
                    title="Download subject core, taxes, and related JSON for backup or the spreadsheet Apps Script importer."
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-800"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setIsExportDialogOpen(true);
                    }}
                  >
                    <ArrowDownTrayIcon
                      className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400"
                      aria-hidden
                    />
                    Export JSON
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={actionsDisabled}
                    title="Write the subject row to the appraisal Google Sheet (row 2 on the subject tab). Asks for confirmation first."
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-800"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      pushToSheetRef.current?.openConfirm();
                    }}
                  >
                    <ArrowUpTrayIcon
                      className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden
                    />
                    Push to Sheet
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
          <div className="hidden md:flex md:flex-wrap md:items-center md:justify-end md:gap-1.5">
            <div className="group relative inline-flex">
              <DocumentPanelToggle
                variant="icon"
                omitNativeTitle
                onClick={() =>
                  docPanel.open({ projectId, sectionKey: "subject" })
                }
              />
              <span className={TOOLBAR_HOVER_HINT_CLASS}>
                Browse project documents (deeds, CAD, engagement) and extracted
                text for this section.
              </span>
            </div>
            <div className="group relative inline-flex">
              <button
                type="button"
                onClick={() => void handleRebuildFromDocuments()}
                disabled={rebuildDisabled}
                aria-label="Rebuild subject data from processed documents"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition hover:border-blue-600 hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-300 dark:focus-visible:ring-blue-500/50"
              >
                {isRebuildLoading ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden />
                )}
                Rebuild
              </button>
              <span className={TOOLBAR_HOVER_HINT_CLASS}>
                Re-merge processed documents into subject fields. Review dialog
                before saving.
              </span>
            </div>
            <div className="group relative inline-flex">
              <button
                type="button"
                onClick={() => setIsExportDialogOpen(true)}
                disabled={actionsDisabled}
                aria-label="Export subject data as JSON"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:border-violet-500 hover:bg-violet-50 hover:text-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:border-violet-700 dark:hover:bg-violet-950/30 dark:hover:text-violet-300 dark:focus-visible:ring-violet-500/50"
              >
                <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
              </button>
              <span className={TOOLBAR_HOVER_HINT_CLASS}>
                Download JSON for backup or the spreadsheet Apps Script
                importer.
              </span>
            </div>
            <div className="group relative inline-flex items-center gap-2">
              <PushToSheetButton
                ref={pushToSheetRef}
                iconOnly
                omitNativeTitle
                showInlineFeedback
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
              <span className={TOOLBAR_HOVER_HINT_CLASS}>
                Push subject row to the Google Sheet (subject tab). Confirms
                before sending.
              </span>
            </div>
          </div>
        </div>
      </header>
      {isPendingReview && !showMergeReview && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-700 bg-amber-950/50 px-4 py-3">
          <svg className="h-5 w-5 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.168-.168 2.63-1.515 2.63H3.72c-1.347 0-2.188-1.462-1.515-2.63L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-200">
              Rebuild complete &mdash; review needed
            </p>
            <p className="text-xs text-amber-400/80">
              New proposed values from processed documents are ready for review.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleStartReview()}
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Review Changes
          </button>
        </div>
      )}
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
              className={`mb-4 w-full${expandedSections.has("Property Info") ? " [column-span:all]" : " break-inside-avoid"}`}
              isExpanded={expandedSections.has("Property Info")}
              onToggleExpand={() => toggleSection("Property Info")}
              expandLabel="Parcels"
            >
              <FormField
                label="Address"
                value={core.Address}
                onChange={(v) => updateCore("Address", v)}
                onBlur={saveNow}
                placeholder="123 Main St"
              />
              <FormField
                label="APN"
                value={core.APN}
                onChange={(v) => updateCore("APN", v || null)}
                onBlur={saveNow}
              />
              <FormField
                label="Legal Description"
                value={core.Legal}
                onChange={(v) => updateCore("Legal", v || null)}
                onBlur={saveNow}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="City"
                  value={core.City}
                  onChange={(v) => updateCore("City", v)}
                  onBlur={saveNow}
                />
                <FormField
                  label="State"
                  value={core.State}
                  onChange={(v) => updateCore("State", v)}
                  onBlur={saveNow}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Zip"
                  value={core.Zip}
                  onChange={(v) => updateCore("Zip", v)}
                  onBlur={saveNow}
                />
                <FormField
                  label="County"
                  value={core.County}
                  onChange={(v) => updateCore("County", v)}
                  onBlur={saveNow}
                />
              </div>
              <SelectField
                label="Property Rights"
                value={core["Property Rights"]}
                options={PROPERTY_RIGHTS_OPTIONS.map((o) => ({
                  label: o,
                  value: o,
                }))}
                onChange={(v) => {
                  updateCore("Property Rights", v);
                  scheduleSaveNow();
                }}
              />
              <FormField
                label="Property Type"
                value={core["Property Type"] as string | undefined}
                onChange={(v) => updateCore("Property Type", v || null)}
                onBlur={saveNow}
              />
              <FormField
                label="Property Type Long"
                value={core["Property Type Long"] as string | undefined}
                onChange={(v) => updateCore("Property Type Long", v || null)}
                onBlur={saveNow}
              />
              <FormField
                label="Instrument Number"
                value={core.instrumentNumber}
                onChange={(v) => updateCore("instrumentNumber", v || null)}
                onBlur={saveNow}
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
              {expandedSections.has("Property Info") && (
                <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Parcels
                  </p>
                  <ParcelDataTable
                    rows={displayParcels.map((p, i) =>
                      parcelDataToRow(p, i),
                    )}
                    onUpdate={handleParcelUpdate}
                    onDelete={handleParcelDelete}
                    onAdd={handleParcelAdd}
                  />
                </div>
              )}
            </SectionCard>

            {/* Zoning & Location */}
            <SectionCard
              title="Zoning & Location"
              className="mb-4 w-full break-inside-avoid"
            >
              <SelectField
                label="Zoning Area"
                value={
                  parseZoningLocation(core["Zoning Area"] as unknown) ?? ""
                }
                options={ZONING_LOCATION_OPTIONS.map((o) => ({
                  label: o,
                  value: o,
                }))}
                onChange={(v) => {
                  updateCore("Zoning Area", v ? parseZoningLocation(v) : null);
                  scheduleSaveNow();
                }}
              />
              <FormField
                label="Zoning Description"
                value={core["Zoning Description"]}
                onChange={(v) => updateCore("Zoning Description", v)}
                onBlur={saveNow}
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
                onChange={(v) => {
                  updateCore("Corner", v);
                  scheduleSaveNow();
                }}
              />
              <SelectField
                label="Frontage"
                value={core.Frontage as string | null | undefined}
                options={FRONTAGE_OPTIONS.map((o) => ({ label: o, value: o }))}
                onChange={(v) => {
                  updateCore("Frontage", v || null);
                  scheduleSaveNow();
                }}
              />
            </SectionCard>

            {/* Physical */}
            <SectionCard
              title="Physical Characteristics"
              className={`mb-4 w-full${expandedSections.has("Physical Characteristics") ? " [column-span:all]" : " break-inside-avoid"}`}
              isExpanded={expandedSections.has("Physical Characteristics")}
              onToggleExpand={() => toggleSection("Physical Characteristics")}
              expandLabel="Improvements"
            >
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Land Size (AC)"
                  type="number"
                  value={core["Land Size (AC)"]}
                  onChange={(v) => {
                    dirtyRef.current = true;
                    setCore((prev) => {
                      const ac = v ? Number(v) : null;
                      const next: CoreData = { ...prev, "Land Size (AC)": ac };
                      if (ac == null || Number.isNaN(ac)) {
                        next["Land Size (SF)"] = null;
                      } else {
                        const sf = acToSf(ac);
                        if (sf != null) next["Land Size (SF)"] = sf;
                      }
                      return next;
                    });
                  }}
                  onBlur={saveNow}
                />
                {subjectLandAc != null ? (
                  <ComputedField
                    label="Land Size (SF)"
                    value={acToSf(subjectLandAc)}
                  />
                ) : (
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
                    onBlur={saveNow}
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Building Size (SF)"
                  type="number"
                  value={core["Building Size (SF)"]}
                  onChange={(v) =>
                    updateCore("Building Size (SF)", v ? Number(v) : null)
                  }
                  onBlur={saveNow}
                />
                <FormField
                  label="Parking (SF)"
                  type="number"
                  value={core["Parking (SF)"]}
                  onChange={(v) =>
                    updateCore("Parking (SF)", v ? Number(v) : null)
                  }
                  onBlur={saveNow}
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
                  onBlur={saveNow}
                />
                <FormField
                  label="Warehouse Area (SF)"
                  type="number"
                  value={core["Warehouse Area (SF)"] as number | undefined}
                  onChange={(v) =>
                    updateCore("Warehouse Area (SF)", v ? Number(v) : null)
                  }
                  onBlur={saveNow}
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
                  onBlur={saveNow}
                />
                <FormField
                  label="Parking Spaces Details"
                  value={core["Parking Spaces Details"] as string | undefined}
                  onChange={(v) =>
                    updateCore("Parking Spaces Details", v || null)
                  }
                  onBlur={saveNow}
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
              <FormField
                label="Year Built"
                type="text"
                placeholder="e.g. 2021, 2010, 2015 (one year per building)"
                value={yearBuiltInputValue(core["Year Built"])}
                onChange={(v) =>
                  updateCore("Year Built", v.trim() !== "" ? v.trim() : null)
                }
                onBlur={saveNow}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Age uses the project effective date (
                {project?.effectiveDate?.trim()
                  ? project.effectiveDate
                  : "not set — using current year"}
                ) minus the oldest year listed. Effective age is SF-weighted
                across buildings when total building SF is set.
              </p>
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
                <div className="shrink-0 sm:min-w-[9rem]">
                  <ToggleField
                    label="Override?"
                    value={core["Age Override"] === true}
                    onChange={(v) => {
                      updateCore("Age Override", v);
                      if (!v) {
                        updateCore("Age", null);
                      }
                      scheduleSaveNow();
                    }}
                  />
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Manual age
                  </p>
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3 min-[480px]:grid-cols-2">
                  {core["Age Override"] === true ? (
                    <FormField
                      label="Age"
                      type="number"
                      value={core.Age}
                      onChange={(v) =>
                        updateCore("Age", v ? Number(v) : null)
                      }
                      onBlur={saveNow}
                    />
                  ) : (
                    <ComputedField
                      label="Age"
                      value={displayChronologicalAge}
                    />
                  )}
                  <ComputedField
                    label="Effective Age"
                    value={displayEffectiveAge}
                  />
                </div>
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
                onChange={(v) => {
                  updateCore(
                    "Condition",
                    v as "Good" | "Average" | "Fair" | "Poor",
                  );
                  scheduleSaveNow();
                }}
              />
              <FormField
                label="Construction"
                value={core.Construction}
                onChange={(v) => updateCore("Construction", v || null)}
                onBlur={saveNow}
              />
              {expandedSections.has("Physical Characteristics") && (
                <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Parcel Improvements
                  </p>
                  <ParcelImprovementsTable
                    rows={displayImprovements.map((imp, i) =>
                      parcelImprovementToRow(imp, i),
                    )}
                    onUpdate={handleImprovementUpdate}
                    onDelete={handleImprovementDelete}
                    onAdd={handleImprovementAdd}
                  />
                </div>
              )}
            </SectionCard>

            {/* Utilities */}
            <SectionCard
              title="Utilities"
              className="mb-4 w-full break-inside-avoid"
            >
              <ToggleField
                label="Electricity"
                value={core["Utils - Electricity"] ?? false}
                onChange={(v) => {
                  updateCore("Utils - Electricity", v);
                  scheduleSaveNow();
                }}
              />
              <SelectField
                label="Water"
                value={core["Utils - Water"]}
                options={[
                  { label: "Public", value: "Public" },
                  { label: "Well", value: "Well" },
                  { label: "None", value: "None" },
                ]}
                onChange={(v) => {
                  updateCore(
                    "Utils - Water",
                    (v || null) as "Public" | "Well" | "None" | null,
                  );
                  scheduleSaveNow();
                }}
              />
              <SelectField
                label="Sewer"
                value={core["Utils - Sewer"]}
                options={[
                  { label: "Public", value: "Public" },
                  { label: "Septic", value: "Septic" },
                  { label: "None", value: "None" },
                ]}
                onChange={(v) => {
                  updateCore(
                    "Utils - Sewer",
                    (v || null) as "Public" | "Septic" | "None" | null,
                  );
                  scheduleSaveNow();
                }}
              />
              <SelectField
                label="Surface"
                value={core.Surface}
                options={[
                  { label: "Cleared", value: "Cleared" },
                  { label: "Caliche", value: "Caliche" },
                  { label: "Raw", value: "Raw" },
                ]}
                onChange={(v) => {
                  updateCore(
                    "Surface",
                    (v || null) as "Cleared" | "Caliche" | "Raw" | null,
                  );
                  scheduleSaveNow();
                }}
              />
              <SelectField
                label="Overall Status"
                value={core.Utilities as string | null | undefined}
                options={UTILITIES_STATUS_OPTIONS.map((o) => ({
                  label: o,
                  value: o,
                }))}
                onChange={(v) => {
                  updateCore("Utilities", v ? v : null);
                  scheduleSaveNow();
                }}
              />
            </SectionCard>

            <SectionCard
              title="Property Features"
              className="mb-4 w-full break-inside-avoid"
            >
              <FormField
                label="Other Features"
                type="textarea"
                value={core["Other Features"] as string | undefined}
                onChange={(v) => updateCore("Other Features", v || null)}
                onBlur={saveNow}
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
                onChange={(v) => {
                  updateCore(
                    "Wash Bay",
                    v === "Yes" ? true : v === "No" ? false : null,
                  );
                  scheduleSaveNow();
                }}
              />
              <FormField
                label="Hoisting"
                value={core.Hoisting as string | undefined}
                onChange={(v) => updateCore("Hoisting", v || null)}
                onBlur={saveNow}
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
                  onBlur={saveNow}
                />
                <FormField
                  label="Lease Start"
                  value={core["Lease Start"] as string | undefined}
                  onChange={(v) => updateCore("Lease Start", v || null)}
                  onBlur={saveNow}
                />
                <FormField
                  label="Rent / Month"
                  type="number"
                  value={core["Rent / Month"] as number | undefined}
                  onChange={(v) =>
                    updateCore("Rent / Month", v ? Number(v) : null)
                  }
                  onBlur={saveNow}
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
                  onChange={(v) => {
                    updateCore(
                      "Expense Structure",
                      (v || null) as ExpenseStructure | null,
                    );
                    scheduleSaveNow();
                  }}
                />
                <FormField
                  label="Occupancy %"
                  value={core["Occupancy %"] as string | undefined}
                  onChange={(v) => updateCore("Occupancy %", v || null)}
                  onBlur={saveNow}
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
                  onBlur={saveNow}
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
                onBlur={saveNow}
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
                onBlur={saveNow}
              />
              <FormField
                label="Est Insurance"
                type="number"
                value={core["Est Insurance"]}
                onChange={(v) =>
                  updateCore("Est Insurance", v ? Number(v) : null)
                }
                onBlur={saveNow}
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
                      dirtyRef.current = true;
                      const next = [...taxes];
                      next[i] = { ...next[i]!, Entity: e.target.value };
                      setTaxes(next);
                    }}
                    onBlur={saveNow}
                    placeholder="Entity name"
                    className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <input
                    type="number"
                    value={tax.Amount}
                    onChange={(e) => {
                      dirtyRef.current = true;
                      const next = [...taxes];
                      next[i] = { ...next[i]!, Amount: Number(e.target.value) };
                      setTaxes(next);
                    }}
                    onBlur={saveNow}
                    placeholder="Amount"
                    className="w-36 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      dirtyRef.current = true;
                      setTaxes(taxes.filter((_, j) => j !== i));
                      scheduleSaveNow();
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  setTaxes([...taxes, { Entity: "", Amount: 0 }]);
                  scheduleSaveNow();
                }}
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                + Add Row
              </button>
            </div>
          </SectionCard>
        </>
      ) : null}

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

      {/* Rebuild from Documents — legacy blocking merge dialog */}
      {pendingRebuildData && (
        <DataMergeDialog
          isOpen
          title="Rebuild from Documents — Review Changes"
          currentData={{
            ...pendingRebuildData.currentCore,
            parcels: pendingRebuildData.currentParcels,
            improvements: pendingRebuildData.currentImprovements,
          }}
          proposedData={{
            ...pendingRebuildData.proposedCore,
            parcels: pendingRebuildData.proposedParcels,
            improvements: pendingRebuildData.proposedImprovements,
          }}
          onConfirm={async (mergedCombined) => {
            const {
              parcels: mParcels,
              improvements: mImprovements,
              ...coreOnly
            } = mergedCombined;
            const merged = applyComputedAgeFields(
              normalizeLandSizeFromAc(coreOnly as CoreData),
              project?.effectiveDate,
            );
            await saveSubjectData({
              core: merged as SubjectData,
              fema: pendingRebuildData.proposedFema as FemaData,
              ...(Array.isArray(mParcels)
                ? { parcels: mParcels as ParcelData[] }
                : {}),
              ...(Array.isArray(mImprovements)
                ? { improvements: mImprovements as ParcelImprovement[] }
                : {}),
            });
            dirtyRef.current = false;
            setCore(merged);
            setPendingRebuildData(null);
          }}
          onCancel={() => setPendingRebuildData(null)}
        />
      )}

      {/* Rebuild from Documents — async (DB-stored proposed data) merge dialog */}
      {showMergeReview && isPendingReview && (
        <DataMergeDialog
          isOpen
          title="Rebuild from Documents — Review Changes"
          currentData={{
            ...((subjectData?.core ?? {}) as Record<string, unknown>),
            parcels: subjectData?.parcels ?? [],
            improvements: subjectData?.improvements ?? [],
          }}
          proposedData={{
            ...((subjectData?.proposed_core ??
              subjectData?.core ??
              {}) as Record<string, unknown>),
            parcels:
              subjectData?.proposed_parcels ?? subjectData?.parcels ?? [],
            improvements:
              subjectData?.proposed_improvements ??
              subjectData?.improvements ??
              [],
          }}
          onConfirm={handleMergeConfirm}
          onCancel={handleMergeCancel}
        />
      )}
    </div>
  );
}
