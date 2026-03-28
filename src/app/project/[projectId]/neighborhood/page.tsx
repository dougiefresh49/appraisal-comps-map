"use client";

import Link from "next/link";
import { use } from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { ReportSectionPage } from "~/components/ReportSectionPage";

interface NeighborhoodPageProps {
  params: Promise<{ projectId: string }>;
}

export default function NeighborhoodPage({ params }: NeighborhoodPageProps) {
  const { projectId } = use(params);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      {/* Map Banner */}
      <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex h-56 items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <div className="mb-2 text-4xl">🗺️</div>
            <p className="text-sm font-medium">Neighborhood Map</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Edit the map to update this preview
            </p>
          </div>
        </div>
        <Link
          href={`/project/${projectId}/neighborhood-map`}
          className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-800"
        >
          <PencilSquareIcon className="h-3.5 w-3.5" />
          Edit Map
        </Link>
      </div>

      {/* Neighborhood Analysis Writeup */}
      <ReportSectionPage
        section="neighborhood"
        title="Neighborhood Analysis"
        description="Generate, view, and edit the neighborhood analysis section."
      />
    </div>
  );
}
