"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { DocumentPanelToggle } from "~/components/DocumentContextPanel";
import { useDocumentPanel } from "~/components/DocumentPanelContext";
import { CompAddFlow } from "~/components/CompAddFlow";
import { DataMergeDialog } from "~/components/DataMergeDialog";
import { PushToSheetButton } from "~/components/PushToSheetButton";
import { useCompParsedData } from "~/hooks/useCompParsedData";
import { useProject } from "~/hooks/useProject";
import type { LandSaleData, SaleData, RentalData } from "~/types/comp-data";
import {
  DEFAULT_APPROACHES,
  getComparablesByType,
  type ComparableType,
  type ComparableParsedDataStatus,
} from "~/utils/projectStore";
import { CompDetailContent } from "~/components/CompDetailContent";
import { driveFetch } from "~/lib/drive-fetch";

export interface CompDetailPageProps {
  projectId: string;
  compId: string;
  compType: ComparableType;
  typeSlug: string;
}

function statusBadgeClasses(
  status: ComparableParsedDataStatus | undefined,
): string {
  switch (status) {
    case "processing":
    case "reparsing":
      return "bg-blue-100 text-blue-800 ring-1 ring-blue-200 animate-pulse dark:bg-blue-950/80 dark:text-blue-300 dark:ring-blue-800/80";
    case "parsed":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:ring-emerald-800/80";
    case "pending_review":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:ring-amber-800/80";
    case "error":
      return "bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-950/80 dark:text-red-300 dark:ring-red-800/80";
    default:
      return "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800/80 dark:text-gray-400 dark:ring-gray-700";
  }
}

function statusDisplayLabel(
  status: ComparableParsedDataStatus | undefined,
): string {
  switch (status) {
    case "reparsing":
      return "re-parsing";
    case "pending_review":
      return "review needed";
    default:
      return status ?? "none";
  }
}

function compLocationMapHref(
  projectId: string,
  typeSlug: string,
  compType: ComparableType,
  compId: string,
): string {
  if (compType === "Rentals") {
    return `/project/${projectId}/rentals/comparables-map`;
  }
  return `/project/${projectId}/${typeSlug}/comps/${compId}/location-map`;
}

function compSectionTag(
  compType: ComparableType,
  displayNumber: string,
): string {
  const typeSlug =
    compType === "Land"
      ? "land"
      : compType === "Sales"
        ? "sales"
        : "rentals";
  return `${typeSlug}-comp-${displayNumber}`;
}

export function CompDetailPage({
  projectId,
  compId,
  compType,
  typeSlug,
}: CompDetailPageProps) {
  const { project, isLoading: projectLoading, projectExists } =
    useProject(projectId);
  const {
    parsedData,
    saveParsedData,
    clearProposedData,
    refreshParsedData,
  } = useCompParsedData(compId);

  const docPanel = useDocumentPanel();
  const [showParseFlow, setShowParseFlow] = useState(false);
  const [showReparseFlow, setShowReparseFlow] = useState(false);
  const [pendingProposedData, setPendingProposedData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [showMergeReview, setShowMergeReview] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const comparables = project ? getComparablesByType(project, compType) : [];
  const comp = comparables.find((c) => c.id === compId);
  const approaches = project?.approaches ?? DEFAULT_APPROACHES;
  const compFolderId = comp?.folderId;

  useEffect(() => {
    if (!compFolderId) return;
    void (async () => {
      try {
        const res = await driveFetch("/api/comps-folder-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: compFolderId }),
        });
        const data = (await res.json()) as { name?: string };
        if (!res.ok) return;
        if (data.name) setFolderName(data.name);
      } catch {
        /* ignore */
      }
    })();
  }, [compFolderId]);

  const compIndex = comparables.findIndex((c) => c.id === compId);
  const displayNumber =
    comp?.number ?? (compIndex >= 0 ? String(compIndex + 1) : "?");
  const trimmedAddress = comp?.address?.trim();
  const hasAddress =
    trimmedAddress !== undefined && trimmedAddress !== "";
  const displayAddress = hasAddress ? trimmedAddress : folderName ?? "—";

  const backHref = `/project/${projectId}/${typeSlug}/comparables`;
  const locationMapHref = compLocationMapHref(
    projectId,
    typeSlug,
    compType,
    compId,
  );

  const headerLabel = `${compType.toUpperCase()} COMP #${displayNumber} — ${displayAddress}`;

  const saveParsedDataRef = useRef(saveParsedData);
  saveParsedDataRef.current = saveParsedData;
  const clearProposedDataRef = useRef(clearProposedData);
  clearProposedDataRef.current = clearProposedData;

  const isPendingReview = comp?.parsedDataStatus === "pending_review";

  // Whether the merge dialog should be open -- driven by user action or
  // inline pendingProposedData from the legacy preview flow.
  const isMergeDialogOpen = showMergeReview || !!pendingProposedData;

  // The proposed data to show in the dialog: inline (legacy) or from DB
  const effectiveProposedData = pendingProposedData
    ?? (showMergeReview && parsedData?.proposed_raw_data
      ? (parsedData.proposed_raw_data as Record<string, unknown>)
      : null);

  // Whether this merge is against DB-stored proposed_raw_data (vs inline)
  const isDbMerge = !pendingProposedData && showMergeReview;

  const handleStartReview = useCallback(async () => {
    await refreshParsedData();
    setShowMergeReview(true);
  }, [refreshParsedData]);

  const handleMergeConfirm = useCallback(
    async (merged: Record<string, unknown>) => {
      if (isDbMerge) {
        await clearProposedDataRef.current(
          merged as unknown as LandSaleData | SaleData | RentalData,
        );
      } else {
        await saveParsedDataRef.current(
          merged as unknown as LandSaleData | SaleData | RentalData,
        );
      }
      setPendingProposedData(null);
      setShowMergeReview(false);
    },
    [isDbMerge],
  );

  const handleMergeCancel = useCallback(async () => {
    if (isDbMerge && parsedData) {
      await clearProposedDataRef.current(
        parsedData.raw_data as unknown as LandSaleData | SaleData | RentalData,
      );
    }
    setPendingProposedData(null);
    setShowMergeReview(false);
  }, [isDbMerge, parsedData]);

  if (projectLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gray-600 dark:text-gray-400">
        Loading project…
      </div>
    );
  }

  if (!projectExists || !project) {
    return (
      <div className="p-8 text-sm text-gray-500">Project not found.</div>
    );
  }

  if (!comp) {
    return (
      <div className="p-8 text-sm text-gray-500">
        Comparable not found in this project.
        <div className="mt-4">
          <Link
            href={backHref}
            className="text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Back to Comps
          </Link>
        </div>
      </div>
    );
  }

  const compsFolderKey =
    compType === "Land" ? "land" : compType === "Sales" ? "sales" : "rentals";
  const compsFolderId =
    project.folderStructure?.compsFolderIds?.[compsFolderKey];

  return (
    <div className="p-6 md:p-8">
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Comps
        </Link>
        <div className="flex items-center gap-2">
          <DocumentPanelToggle
            onClick={() =>
              docPanel.open({
                projectId,
                sectionKey: "comp-detail",
                compFolderId,
                sectionTag: compSectionTag(compType, displayNumber),
              })
            }
          />
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-600 dark:text-gray-500">
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-600 dark:text-red-400">
              Save failed
            </span>
          )}
          {parsedData && comp.parsedDataStatus !== "reparsing" && comp.parsedDataStatus !== "pending_review" && (
            <button
              type="button"
              onClick={() => setShowReparseFlow(true)}
              title="Re-parse with new documents"
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Re-parse
            </button>
          )}
          {parsedData && (
            <PushToSheetButton
              confirmDescription={`${compType.toLowerCase()} comp #${displayNumber} data to the spreadsheet`}
              confirmDetail="All non-formula fields will be written. If the comp is found by Use Type + Recording, its existing row is updated. Otherwise a new row is appended."
              onPush={async () => {
                const res = await driveFetch("/api/spreadsheet/push-comp", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    projectId,
                    compId,
                    compType,
                  }),
                });
                if (!res.ok) {
                  const data = (await res.json()) as { error?: string };
                  throw new Error(data.error ?? "Push failed");
                }
              }}
              disabled={!parsedData}
            />
          )}
        </div>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 border-b border-gray-200 pb-6 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 md:text-2xl dark:text-gray-100">
            {headerLabel}
          </h1>
          {comp.parsedDataStatus && comp.parsedDataStatus !== "none" && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClasses(comp.parsedDataStatus)}`}
            >
              {statusDisplayLabel(comp.parsedDataStatus)}
            </span>
          )}
        </div>
        {!hasAddress && folderName && (
          <p className="text-xs text-gray-600 dark:text-gray-500">
            Folder: {folderName}
          </p>
        )}
      </div>

      {/* Re-parse banner */}
      {comp.parsedDataStatus === "reparsing" && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-950/20">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              Re-parse in progress
            </p>
          </div>
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
            Editing is disabled until the re-parse completes and you review the
            results.
          </p>
        </div>
      )}

      {/* Pending review banner */}
      {isPendingReview && !showMergeReview && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Re-parse complete — review needed
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                New data is available from the re-parse. Review and merge the
                changes to update this comp.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleStartReview()}
              className="shrink-0 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
            >
              Review Changes
            </button>
          </div>
        </div>
      )}

      {/* Body — uses CompDetailContent for map + form */}
      <CompDetailContent
        projectId={projectId}
        compId={compId}
        compType={compType}
        compFolderId={compFolderId}
        locationMapHref={locationMapHref}
        parsedDataStatus={comp.parsedDataStatus}
        approaches={approaches}
        layout="page"
        onParseRequest={() => setShowParseFlow(true)}
        onSaveStatusChange={setSaveStatus}
      />

      {/* Overlays */}
      {showParseFlow && (
        <CompAddFlow
          projectId={projectId}
          compId={compId}
          compType={compType}
          compsFolderId={compsFolderId}
          projectFolderId={project.projectFolderId}
          initialFolderId={compFolderId}
          onComplete={() => {
            void refreshParsedData();
            setShowParseFlow(false);
          }}
          onClose={() => setShowParseFlow(false)}
        />
      )}

      {showReparseFlow && (
        <CompAddFlow
          projectId={projectId}
          compId={compId}
          compType={compType}
          compsFolderId={compsFolderId}
          projectFolderId={project.projectFolderId}
          initialFolderId={compFolderId}
          onComplete={() => {
            void refreshParsedData();
            setShowReparseFlow(false);
          }}
          onClose={() => setShowReparseFlow(false)}
          onPreviewComplete={(proposed) => {
            setPendingProposedData(proposed);
            setShowReparseFlow(false);
          }}
        />
      )}

      {isMergeDialogOpen && effectiveProposedData && parsedData && (
        <DataMergeDialog
          isOpen
          title="Review & Merge Re-parse Results"
          currentData={parsedData.raw_data as Record<string, unknown>}
          proposedData={effectiveProposedData}
          onConfirm={handleMergeConfirm}
          onCancel={() => void handleMergeCancel()}
        />
      )}
    </div>
  );
}
