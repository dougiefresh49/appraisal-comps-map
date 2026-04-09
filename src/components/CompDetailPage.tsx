"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import { CompAddFlow } from "~/components/CompAddFlow";
import { DataMergeDialog } from "~/components/DataMergeDialog";
import { PushToSheetButton } from "~/components/PushToSheetButton";
import { useCompParsedData } from "~/hooks/useCompParsedData";
import { useProject } from "~/hooks/useProject";
import type { LandSaleData, SaleData, RentalData } from "~/types/comp-data";
import {
  DEFAULT_APPROACHES,
  getComparablesByType,
  mapTypeForCompType,
  type ComparableType,
  type ComparableParsedDataStatus,
} from "~/utils/projectStore";
import { CompDetailContent } from "~/components/CompDetailContent";

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
      return "bg-blue-100 text-blue-800 ring-1 ring-blue-200 animate-pulse dark:bg-blue-950/80 dark:text-blue-300 dark:ring-blue-800/80";
    case "parsed":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:ring-emerald-800/80";
    case "error":
      return "bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-950/80 dark:text-red-300 dark:ring-red-800/80";
    default:
      return "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800/80 dark:text-gray-400 dark:ring-gray-700";
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
    refreshParsedData,
  } = useCompParsedData(compId);

  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);
  const [showParseFlow, setShowParseFlow] = useState(false);
  const [showReparseFlow, setShowReparseFlow] = useState(false);
  const [pendingProposedData, setPendingProposedData] = useState<Record<
    string,
    unknown
  > | null>(null);
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
        const res = await fetch("/api/comps-folder-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: compFolderId }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { name?: string };
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

  // Keep a stable ref to saveParsedData for the DataMergeDialog confirm handler
  const saveParsedDataRef = useRef(saveParsedData);
  saveParsedDataRef.current = saveParsedData;

  const handleMergeConfirm = useCallback(
    async (merged: Record<string, unknown>) => {
      await saveParsedDataRef.current(
        merged as unknown as LandSaleData | SaleData | RentalData,
      );
      setPendingProposedData(null);
    },
    [],
  );

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
          <DocumentPanelToggle onClick={() => setIsDocPanelOpen(true)} />
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
          {parsedData && (
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
                const res = await fetch("/api/spreadsheet/push-comp", {
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
              {comp.parsedDataStatus}
            </span>
          )}
        </div>
        {!hasAddress && folderName && (
          <p className="text-xs text-gray-600 dark:text-gray-500">
            Folder: {folderName}
          </p>
        )}
      </div>

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
      <DocumentContextPanel
        projectId={projectId}
        sectionKey="comp-detail"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
        compFolderId={compFolderId}
        sectionTag={compSectionTag(compType, displayNumber)}
      />

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

      {pendingProposedData && parsedData && (
        <DataMergeDialog
          isOpen
          title="Review & Merge Re-parse Results"
          currentData={parsedData.raw_data as Record<string, unknown>}
          proposedData={pendingProposedData}
          onConfirm={handleMergeConfirm}
          onCancel={() => setPendingProposedData(null)}
        />
      )}
    </div>
  );
}
