"use client";

import { use, useState } from "react";
import { ReportSectionPage } from "~/components/ReportSectionPage";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import { useSubjectData } from "~/hooks/useSubjectData";
import type { SubjectData, Condition } from "~/types/comp-data";

function formatAcres(ac: number | null | undefined, sf: number | null | undefined): string | null {
  if (ac != null && ac > 0) return `${ac.toLocaleString()} AC`;
  if (sf != null && sf > 0) return `${sf.toLocaleString()} SF`;
  return null;
}

function formatSF(sf: number | null | undefined): string | null {
  if (sf == null || sf <= 0) return null;
  return `${sf.toLocaleString()} SF`;
}

const CONDITION_COLOR: Record<Condition, string> = {
  Good: "text-emerald-400",
  Average: "text-blue-400",
  Fair: "text-amber-400",
  Poor: "text-red-400",
};

function KeyFact({ label, value, accent }: { label: string; value: string | null; accent?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${accent ?? "text-gray-200"}`}>{value}</span>
    </div>
  );
}

function SiteSummaryKeyFacts({ projectId }: { projectId: string }) {
  const { subjectData, isLoading } = useSubjectData(projectId);

  if (isLoading) {
    return (
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-blue-500" />
          <span className="text-xs text-gray-500">Loading subject data…</span>
        </div>
      </div>
    );
  }

  const core = (subjectData?.core ?? {}) as Partial<SubjectData> & Record<string, unknown>;

  const landSize = formatAcres(
    core["Land Size (AC)"] as number | null,
    core["Land Size (SF)"] as number | null,
  );
  const buildingSize = formatSF(core["Building Size (SF)"] as number | null);
  const yearBuilt = core["Year Built"] ? String(core["Year Built"]) : null;
  const condition = core.Condition;
  const construction = core.Construction;
  const zoning = core.Zoning;

  const hasFacts = landSize ?? buildingSize ?? yearBuilt ?? condition ?? construction ?? zoning;
  if (!hasFacts) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Key Site Facts
      </h3>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <KeyFact label="Land Size" value={landSize} />
        <KeyFact label="Building Size" value={buildingSize} />
        <KeyFact label="Year Built" value={yearBuilt} />
        <KeyFact
          label="Condition"
          value={condition ?? null}
          accent={condition ? CONDITION_COLOR[condition] : undefined}
        />
        <KeyFact label="Construction" value={construction ?? null} />
        <KeyFact label="Zoning" value={zoning ?? null} />
      </div>
    </div>
  );
}

function SubjectSiteSummaryContent({ projectId }: { projectId: string }) {
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);
  const [excludedDocIds, setExcludedDocIds] = useState<Set<string>>(new Set());
  const [includePhotoContext, setIncludePhotoContext] = useState(true);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 flex items-center justify-end">
        <DocumentPanelToggle onClick={() => setIsDocPanelOpen(true)} />
      </div>

      <SiteSummaryKeyFacts projectId={projectId} />

      <ReportSectionPage
        section="subject-site-summary"
        title="Subject Site Summary"
        description="Generate, view, and edit the subject site summary section."
        excludedDocIds={excludedDocIds}
        excludePhotoContext={!includePhotoContext}
      />
      <DocumentContextPanel
        projectId={projectId}
        sectionKey="subject-site-summary"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
        onExcludedIdsChange={setExcludedDocIds}
        showPhotoContext
        onPhotoContextChange={setIncludePhotoContext}
      />
    </div>
  );
}

export default function SubjectSiteSummaryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return <SubjectSiteSummaryContent projectId={projectId} />;
}
