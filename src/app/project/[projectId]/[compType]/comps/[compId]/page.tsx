"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";
import { CompDetailView } from "~/components/CompDetailView";
import { CompAddFlow } from "~/components/CompAddFlow";
import { getComparablesByType } from "~/utils/projectStore";
import type { ComparableType } from "~/utils/projectStore";
import type { CompType } from "~/types/comp-data";
import { useState } from "react";

interface CompDetailPageProps {
  params: Promise<{
    projectId: string;
    compType: string;
    compId: string;
  }>;
}

function routeTypeToCompType(routeType: string): ComparableType | null {
  switch (routeType.toLowerCase()) {
    case "land-sales":
    case "land":
      return "Land";
    case "sales":
      return "Sales";
    case "rentals":
      return "Rentals";
    default:
      return null;
  }
}

function compTypeToApiType(type: ComparableType): CompType {
  switch (type) {
    case "Land":
      return "land";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
  }
}

export default function CompDetailPage({ params }: CompDetailPageProps) {
  const { projectId, compType: routeType, compId } = use(params);
  const { project } = useProject(projectId);
  const [showParseFlow, setShowParseFlow] = useState(false);
  const [parseKey, setParseKey] = useState(0);

  const comparableType = routeTypeToCompType(routeType);
  const comparables = project
    ? getComparablesByType(project, comparableType ?? "Sales")
    : [];
  const comp = comparables.find((c) => c.id === compId);

  const backHref =
    comparableType === "Land"
      ? `/project/${projectId}/land-sales/comparables`
      : comparableType === "Rentals"
        ? `/project/${projectId}/rentals/comparables`
        : `/project/${projectId}/sales/comparables`;

  if (!comparableType) {
    return (
      <div className="p-8 text-sm text-gray-500">Unknown comp type: {routeType}</div>
    );
  }

  return (
    <div className="p-8">
      {/* Back + Parse button */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={backHref}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Comps
        </Link>
        <button
          onClick={() => setShowParseFlow(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Parse Files
        </button>
      </div>

      <CompDetailView
        key={parseKey}
        compId={compId}
        compType={compTypeToApiType(comparableType)}
        compNumber={comp?.number}
        compAddress={comp?.address}
      />

      {showParseFlow && (
        <CompAddFlow
          projectId={projectId}
          compId={compId}
          compType={comparableType}
          projectFolderId={project?.projectFolderId}
          onComplete={() => setParseKey((k) => k + 1)}
          onClose={() => setShowParseFlow(false)}
        />
      )}
    </div>
  );
}
