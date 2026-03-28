"use client";

import { use, useState } from "react";
import { ReportSectionPage } from "~/components/ReportSectionPage";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";

export default function HighestBestUsePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 flex items-center justify-end">
        <DocumentPanelToggle onClick={() => setIsDocPanelOpen(true)} />
      </div>
      <ReportSectionPage
        section="highest-best-use"
        title="Highest and Best Use"
        description="Generate, view, and edit the highest and best use section."
        emptyStateNote="Complete Zoning, Ownership, Subject Site Summary, and Neighborhood first so generated content reflects those sections."
      />
      <DocumentContextPanel
        projectId={projectId}
        sectionKey="highest-best-use"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
      />
    </div>
  );
}
