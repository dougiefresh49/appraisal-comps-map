"use client";

import { use } from "react";
import { CompUITemplate } from "~/components/CompUITemplate";

export default function RentalsUIPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return (
    <CompUITemplate
      projectId={projectId}
      compType="Rentals"
      typeSlug="rentals"
    />
  );
}
