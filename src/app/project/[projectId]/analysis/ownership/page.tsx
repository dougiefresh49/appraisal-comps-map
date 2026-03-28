"use client";

import { use, useState } from "react";
import { ReportSectionPage } from "~/components/ReportSectionPage";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";

export default function OwnershipAnalysisPage({
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
        section="ownership"
        title="Ownership"
        description="Generate, view, and edit the ownership analysis section."
      />
      <DocumentContextPanel
        projectId={projectId}
        sectionKey="ownership"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
      />
    </div>
  );
}
