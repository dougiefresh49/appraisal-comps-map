"use client";

import { use, useState, useEffect } from "react";
import { ReportSectionPage } from "~/components/ReportSectionPage";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import { createClient } from "~/utils/supabase/client";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

interface PrereqStatus {
  key: string;
  label: string;
  exists: boolean;
  updatedAt: string | null;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? "just now" : `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function HBUPrerequisiteStatus({
  projectId,
  hbuUpdatedAt,
}: {
  projectId: string;
  hbuUpdatedAt: string | null;
}) {
  const [prereqs, setPrereqs] = useState<PrereqStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();

    const prereqKeys = ["zoning", "ownership", "subject-site-summary"];
    const labels: Record<string, string> = {
      zoning: "Zoning",
      ownership: "Ownership",
      "subject-site-summary": "Subject Site Summary",
    };

    void supabase
      .from("report_sections")
      .select("section_key, content, updated_at")
      .eq("project_id", projectId)
      .in("section_key", prereqKeys)
      .then(({ data }) => {
        const rowMap = new Map(
          (data ?? []).map((r) => [
            r.section_key as string,
            { content: r.content as string, updatedAt: r.updated_at as string },
          ]),
        );

        setPrereqs(
          prereqKeys.map((key) => {
            const row = rowMap.get(key);
            return {
              key,
              label: labels[key] ?? key,
              exists: !!row && row.content.trim().length > 0,
              updatedAt: row?.updatedAt ?? null,
            };
          }),
        );
        setIsLoading(false);
      });
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-blue-500" />
          <span className="text-xs text-gray-500">Checking prerequisites…</span>
        </div>
      </div>
    );
  }

  const allExist = prereqs.every((p) => p.exists);
  const missingCount = prereqs.filter((p) => !p.exists).length;

  return (
    <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Prerequisite Sections
        </h3>
        {!allExist && (
          <span className="rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            {missingCount} missing
          </span>
        )}
        {allExist && (
          <span className="rounded-full bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            all ready
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {prereqs.map((prereq) => {
          const isStale =
            prereq.exists &&
            prereq.updatedAt &&
            hbuUpdatedAt &&
            new Date(prereq.updatedAt) > new Date(hbuUpdatedAt);

          return (
            <div
              key={prereq.key}
              className={`rounded-lg border p-3 transition-colors ${
                !prereq.exists
                  ? "border-red-900/50 bg-red-950/20"
                  : isStale
                    ? "border-amber-900/50 bg-amber-950/20"
                    : "border-emerald-900/40 bg-emerald-950/10"
              }`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                {!prereq.exists ? (
                  <XCircleIcon className="h-3.5 w-3.5 shrink-0 text-red-400" />
                ) : isStale ? (
                  <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                ) : (
                  <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                )}
                <span className="truncate text-xs font-medium text-gray-200">
                  {prereq.label}
                </span>
              </div>
              {prereq.exists && prereq.updatedAt ? (
                <p className="text-[10px] text-gray-500">
                  {isStale ? (
                    <span className="text-amber-500/80">
                      Updated after HBU · {formatRelativeTime(prereq.updatedAt)}
                    </span>
                  ) : (
                    formatRelativeTime(prereq.updatedAt)
                  )}
                </p>
              ) : (
                <p className="text-[10px] text-red-400/80">Not generated</p>
              )}
            </div>
          );
        })}
      </div>

      {!allExist && (
        <p className="mt-3 text-xs text-amber-400/80">
          Complete all prerequisite sections before generating HBU for best results.
        </p>
      )}
      {allExist && prereqs.some((p) => p.updatedAt && hbuUpdatedAt && new Date(p.updatedAt) > new Date(hbuUpdatedAt)) && (
        <p className="mt-3 text-xs text-amber-400/80">
          Some prerequisites were updated after HBU was last generated. Consider regenerating.
        </p>
      )}
    </div>
  );
}

export default function HighestBestUsePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);
  const [excludedDocIds, setExcludedDocIds] = useState<Set<string>>(new Set());
  const [hbuUpdatedAt, setHbuUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    void supabase
      .from("report_sections")
      .select("updated_at")
      .eq("project_id", projectId)
      .eq("section_key", "highest-best-use")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setHbuUpdatedAt(data.updated_at as string);
      });
  }, [projectId]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 flex items-center justify-end">
        <DocumentPanelToggle onClick={() => setIsDocPanelOpen(true)} />
      </div>

      <HBUPrerequisiteStatus projectId={projectId} hbuUpdatedAt={hbuUpdatedAt} />

      <ReportSectionPage
        section="highest-best-use"
        title="Highest and Best Use"
        description="Generate, view, and edit the highest and best use section."
        emptyStateNote="Complete Zoning, Ownership, Subject Site Summary, and Neighborhood first so generated content reflects those sections."
        excludedDocIds={excludedDocIds}
      />
      <DocumentContextPanel
        projectId={projectId}
        sectionKey="highest-best-use"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
        onExcludedIdsChange={setExcludedDocIds}
      />
    </div>
  );
}
