"use client";

import { use } from "react";
import { SubjectDataEditor } from "~/components/SubjectDataEditor";

interface SubjectOverviewPageProps {
  params: Promise<{ projectId: string }>;
}

export default function SubjectOverviewPage({ params }: SubjectOverviewPageProps) {
  const { projectId } = use(params);

  return (
    <div className="p-8">
      <SubjectDataEditor projectId={projectId} />
    </div>
  );
}
