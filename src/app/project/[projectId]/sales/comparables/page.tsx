"use client";

import { use } from "react";
import { ComparablesPageContent } from "~/components/ComparablesPageContent";

interface PageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function SalesComparablesPage({ params }: PageProps) {
  const { projectId } = use(params);
  return <ComparablesPageContent projectId={projectId} type="Sales" />;
}
