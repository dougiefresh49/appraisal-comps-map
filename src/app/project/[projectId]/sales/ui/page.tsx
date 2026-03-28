"use client";

import { use } from "react";
import { CompUITemplate } from "~/components/CompUITemplate";

export default function SalesUIPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return (
    <CompUITemplate
      projectId={projectId}
      compType="Sales"
      typeSlug="sales"
    />
  );
}
