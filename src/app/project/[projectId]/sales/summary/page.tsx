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
    <div className="p-8">
      <CompSummaryTable projectId={projectId} compType="Sales" />
    </div>
  );
}
