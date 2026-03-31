"use client";

import { use } from "react";
import { CompSummaryTable } from "~/components/CompSummaryTable";

export default function RentalsSummaryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Rentals Summary</h1>
        <p className="mt-1 text-sm text-gray-400">
          Cross-comp comparison of key rental metrics.
        </p>
      </div>
      <CompSummaryTable projectId={projectId} compType="Rentals" />
    </div>
  );
}
