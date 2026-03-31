"use client";

import { use } from "react";
import { CompSummaryTable } from "~/components/CompSummaryTable";

export default function SalesSummaryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Sales Summary</h1>
        <p className="mt-1 text-sm text-gray-400">
          Cross-comp comparison of key sales metrics.
        </p>
      </div>
      <CompSummaryTable projectId={projectId} compType="Sales" />
    </div>
  );
}
