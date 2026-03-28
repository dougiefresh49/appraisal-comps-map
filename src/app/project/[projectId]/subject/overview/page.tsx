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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Subject Overview
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Edit subject property data, zoning, utilities, and tax information.
        </p>
      </div>
      <SubjectDataEditor projectId={projectId} />
    </div>
  );
}
