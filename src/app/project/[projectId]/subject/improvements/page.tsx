"use client";

import { use } from "react";
import { ImprovementAnalysisEditor } from "~/components/ImprovementAnalysisEditor";

interface SubjectImprovementsPageProps {
  params: Promise<{ projectId: string }>;
}

export default function SubjectImprovementsPage({
  params,
}: SubjectImprovementsPageProps) {
  const { projectId } = use(params);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Improvement Analysis
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Add and edit building improvement data for the subject property.
          Fields are color-coded by category.
        </p>
      </div>
      <ImprovementAnalysisEditor projectId={projectId} />
    </div>
  );
}
