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
import { useSubjectData } from "~/hooks/useSubjectData";
import type { SubjectData } from "~/types/comp-data";

function formatCurrency(value: unknown): string | null {
  const num = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  if (isNaN(num)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
}

function DeedFactsBlock({ projectId }: { projectId: string }) {
  const { subjectData, isLoading } = useSubjectData(projectId);

  if (isLoading) {
    return (
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-blue-500" />
          <span className="text-xs text-gray-500">Loading deed information…</span>
        </div>
      </div>
    );
  }

  const core = (subjectData?.core ?? {}) as Partial<SubjectData> & Record<string, unknown>;

  const grantor = core.Grantor ?? (core as Record<string, unknown>).grantor;
  const grantee = core.Grantee ?? (core as Record<string, unknown>).grantee;
  const instrumentNumber = core.instrumentNumber ?? (core as Record<string, unknown>).InstrumentNumber;
  const purchasePrice = (core as Record<string, unknown>).purchasePrice ?? (core as Record<string, unknown>).PurchasePrice ?? (core as Record<string, unknown>)["Sale Price"];
  const deedType = (core as Record<string, unknown>).deedType ?? (core as Record<string, unknown>).DeedType;
  const dateOfSale = core["Date of Sale"];
  const legal = core.Legal;
  const apn = core.APN;

  function toStr(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "number") return String(v);
    return null;
  }

  const facts = [
    { label: "Grantor", value: toStr(grantor) },
    { label: "Grantee", value: toStr(grantee) },
    { label: "Instrument #", value: toStr(instrumentNumber) },
    { label: "Purchase Price", value: formatCurrency(purchasePrice) ?? toStr(purchasePrice) },
    { label: "Deed Type", value: toStr(deedType) },
    { label: "Date of Sale", value: toStr(dateOfSale) },
    { label: "APN", value: toStr(apn) },
    { label: "Legal Description", value: toStr(legal) },
  ].filter((f): f is { label: string; value: string } => f.value !== null && f.value !== undefined && f.value.trim() !== "");

  if (facts.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Deed Information
      </h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className={fact.label === "Legal Description" ? "col-span-2 sm:col-span-3" : ""}>
            <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              {fact.label}
            </dt>
            <dd className="mt-0.5 text-sm text-gray-200 break-words">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function OwnershipPageContent({ projectId }: { projectId: string }) {
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

      <DeedFactsBlock projectId={projectId} />

      <ReportSectionPage
        section="ownership"
        title="Ownership"
        description="Generate, view, and edit the ownership analysis section."
        excludedDocIds={excludedDocIds}
      />
      <SuggestionsPanel
        projectId={projectId}
        sectionKey="ownership"
        isOpen={isSuggestionsPanelOpen}
        onClose={() => setIsSuggestionsPanelOpen(false)}
      />
      <DocumentContextPanel
        projectId={projectId}
        sectionKey="ownership"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
        onExcludedIdsChange={setExcludedDocIds}
      />
    </div>
  );
}

export default function OwnershipAnalysisPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return <OwnershipPageContent projectId={projectId} />;
}
