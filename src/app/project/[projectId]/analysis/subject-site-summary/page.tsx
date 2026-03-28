"use client";

import { use, useState } from "react";
import { ReportSectionPage } from "~/components/ReportSectionPage";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";

export default function SubjectSiteSummaryPage({
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
        section="subject-site-summary"
        title="Subject Site Summary"
        description="Generate, view, and edit the subject site summary section."
      />
      <DocumentContextPanel
        projectId={projectId}
        sectionKey="subject-site-summary"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
      />
    </div>
  );
}
