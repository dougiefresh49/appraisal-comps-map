"use client";

import { use, useCallback, useEffect, useState } from "react";
import { MapBanner } from "~/components/MapBanner";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import { useSubjectData } from "~/hooks/useSubjectData";
interface SubjectFloodMapPageProps {
  params: Promise<{ projectId: string }>;
}

export default function SubjectFloodMapPage({ params }: SubjectFloodMapPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);

  const { subjectData, isLoading, error, saveSubjectData } =
    useSubjectData(decodedProjectId);

  const [femaMapNum, setFemaMapNum] = useState("");
  const [femaZone, setFemaZone] = useState("");
  const [femaIsHazardZone, setFemaIsHazardZone] = useState<string>("");
  const [femaMapDate, setFemaMapDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  useEffect(() => {
    if (!subjectData) return;
    const f = subjectData.fema ?? {};
    setFemaMapNum(typeof f.FemaMapNum === "string" ? f.FemaMapNum : "");
    setFemaZone(typeof f.FemaZone === "string" ? f.FemaZone : "");
    if (f.FemaIsHazardZone === true) setFemaIsHazardZone("yes");
    else if (f.FemaIsHazardZone === false) setFemaIsHazardZone("no");
    else setFemaIsHazardZone("");
    setFemaMapDate(typeof f.FemaMapDate === "string" ? f.FemaMapDate : "");
  }, [subjectData]);

  const handleSaveFema = useCallback(async () => {
    if (!subjectData) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      let hazard: boolean | null = null;
      if (femaIsHazardZone === "yes") hazard = true;
      else if (femaIsHazardZone === "no") hazard = false;

      await saveSubjectData({
        fema: {
          FemaMapNum: femaMapNum,
          FemaZone: femaZone,
          FemaIsHazardZone: hazard,
          FemaMapDate: femaMapDate,
        },
      });
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [
    subjectData,
    saveSubjectData,
    femaMapNum,
    femaZone,
    femaIsHazardZone,
    femaMapDate,
  ]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gray-950 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-950 p-6 text-gray-100 md:p-8">
      <DocumentContextPanel
        projectId={decodedProjectId}
        sectionKey="flood_map"
        isOpen={docsOpen}
        onClose={() => setDocsOpen(false)}
      />

      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Flood Map</h1>
            <p className="mt-1 text-sm text-gray-400">
              FEMA map preview and certificate fields.
            </p>
          </div>
          <DocumentPanelToggle onClick={() => setDocsOpen(true)} />
        </div>

        <MapBanner
          projectId={decodedProjectId}
          imageType="flood"
          actionType="expand"
          height="h-56"
        />

        <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
            FEMA data
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-xs font-medium text-gray-400">
                FEMA map number
              </label>
              <input
                type="text"
                value={femaMapNum}
                onChange={(e) => setFemaMapNum(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none"
                placeholder="e.g. panel number"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-400">
                FEMA zone
              </label>
              <input
                type="text"
                value={femaZone}
                onChange={(e) => setFemaZone(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none"
                placeholder="Zone designation"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-400">
                Hazard zone
              </label>
              <select
                value={femaIsHazardZone}
                onChange={(e) => setFemaIsHazardZone(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none"
              >
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-xs font-medium text-gray-400">
                FEMA map date
              </label>
              <input
                type="text"
                value={femaMapDate}
                onChange={(e) => setFemaMapDate(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none"
                placeholder="Effective or revision date"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-800 pt-4">
            {saveSuccess && (
              <span className="text-sm font-medium text-emerald-400">Saved</span>
            )}
            {saveError && (
              <span className="text-sm text-red-400">{saveError}</span>
            )}
            <button
              type="button"
              onClick={() => void handleSaveFema()}
              disabled={isSaving || !subjectData}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save FEMA fields"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
