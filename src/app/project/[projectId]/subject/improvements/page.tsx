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
    <div className="px-4 pb-10 pt-6 sm:px-6 md:px-8 lg:px-10">
      <header className="pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Improvement Analysis
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Add and edit building improvement data for the subject property.
        </p>
      </header>
      <ImprovementAnalysisEditor projectId={projectId} />
    </div>
  );
}
