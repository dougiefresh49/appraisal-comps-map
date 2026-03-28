"use client";

import { use } from "react";
import { CompDetailPage } from "~/components/CompDetailPage";

export default function RentalsCompDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; compId: string }>;
}) {
  const { projectId, compId } = use(params);
  return (
    <CompDetailPage
      projectId={projectId}
      compId={compId}
      compType="Rentals"
      typeSlug="rentals"
    />
  );
}
