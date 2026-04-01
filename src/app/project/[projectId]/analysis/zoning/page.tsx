"use client";

import { use, useState } from "react";
import { ReportSectionPage } from "~/components/ReportSectionPage";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import { MapBanner } from "~/components/MapBanner";

export default function ZoningAnalysisPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);
  const [excludedDocIds, setExcludedDocIds] = useState<Set<string>>(new Set());

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 flex items-center justify-end">
        <DocumentPanelToggle onClick={() => setIsDocPanelOpen(true)} />
      </div>
      <MapBanner
        projectId={projectId}
        imageType="zoning"
        editHref="#"
        height="h-40"
      />
      <ReportSectionPage
        section="zoning"
        title="Zoning"
        description="Generate, view, and edit the zoning analysis section."
        excludedDocIds={excludedDocIds}
      />
      <DocumentContextPanel
        projectId={projectId}
        sectionKey="zoning"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
        onExcludedIdsChange={setExcludedDocIds}
      />
    </div>
  );
}
