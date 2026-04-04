"use client";

import { use, useState } from "react";
import { ReportSectionPage } from "~/components/ReportSectionPage";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import {
  SuggestionsPanel,
  SuggestionsPanelToggle,
} from "~/components/SuggestionsPanel";
import { MapBanner } from "~/components/MapBanner";

export default function ZoningAnalysisPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);
  const [isSuggestionsPanelOpen, setIsSuggestionsPanelOpen] = useState(false);
  const [excludedDocIds, setExcludedDocIds] = useState<Set<string>>(new Set());

  const openSuggestions = () => {
    setIsDocPanelOpen(false);
    setIsSuggestionsPanelOpen(true);
  };
  const openDocs = () => {
    setIsSuggestionsPanelOpen(false);
    setIsDocPanelOpen(true);
  };

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 flex items-center justify-end gap-2">
        <SuggestionsPanelToggle onClick={openSuggestions} />
        <DocumentPanelToggle onClick={openDocs} />
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
      <SuggestionsPanel
        projectId={projectId}
        sectionKey="zoning"
        isOpen={isSuggestionsPanelOpen}
        onClose={() => setIsSuggestionsPanelOpen(false)}
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
