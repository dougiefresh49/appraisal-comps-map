"use client";

import { use, useState, useCallback, useEffect } from "react";
import { MapBanner } from "~/components/MapBanner";
import { ReportSectionPage } from "~/components/ReportSectionPage";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import { useSubjectData } from "~/hooks/useSubjectData";
import type { SubjectDataRow } from "~/types/comp-data";

interface NeighborhoodPageProps {
  params: Promise<{ projectId: string }>;
}

export default function NeighborhoodPage({ params }: NeighborhoodPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);
  const { subjectData, saveSubjectData } = useSubjectData(decodedProjectId);

  const [boundaries, setBoundaries] = useState({
    north: "",
    south: "",
    east: "",
    west: "",
  });

  useEffect(() => {
    if (subjectData?.core) {
      const b = (subjectData.core as Record<string, unknown>)
        .neighborhoodBoundaries as Record<string, string> | undefined;
      if (b) {
        setBoundaries({
          north: b.north ?? "",
          south: b.south ?? "",
          east: b.east ?? "",
          west: b.west ?? "",
        });
      }
    }
  }, [subjectData]);

  const saveBoundaries = useCallback(
    async (updated: typeof boundaries) => {
      setBoundaries(updated);
      if (!subjectData) return;
      const prevCore = (subjectData.core ?? {}) as Record<string, unknown>;
      const core = {
        ...prevCore,
        neighborhoodBoundaries: updated,
      } as SubjectDataRow["core"];
      await saveSubjectData({
        core,
        taxes: subjectData.taxes,
        tax_entities: subjectData.tax_entities,
        parcels: subjectData.parcels,
        improvements: subjectData.improvements,
      });
    },
    [subjectData, saveSubjectData],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <MapBanner
        projectId={decodedProjectId}
        imageType="neighborhood"
        editHref={`/project/${projectId}/neighborhood-map`}
      />

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Neighborhood Boundaries
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {(["north", "south", "east", "west"] as const).map((dir) => (
            <div key={dir}>
              <label className="mb-1 block text-xs font-medium capitalize text-gray-400">
                {dir}
              </label>
              <input
                type="text"
                value={boundaries[dir]}
                onChange={(e) => {
                  const next = { ...boundaries, [dir]: e.target.value };
                  void saveBoundaries(next);
                }}
                placeholder={`${dir.charAt(0).toUpperCase() + dir.slice(1)} boundary`}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end">
        <DocumentPanelToggle onClick={() => setIsDocPanelOpen(true)} />
      </div>

      <ReportSectionPage
        section="neighborhood"
        title="Neighborhood Analysis"
        description="Generate, view, and edit the neighborhood analysis section."
      />

      <DocumentContextPanel
        projectId={decodedProjectId}
        sectionKey="neighborhood"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
      />
    </div>
  );
}
