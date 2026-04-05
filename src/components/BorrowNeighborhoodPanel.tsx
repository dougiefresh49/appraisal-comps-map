"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  XMarkIcon,
  ArrowDownOnSquareIcon,
  ChevronLeftIcon,
} from "@heroicons/react/24/outline";
import { createClient } from "~/utils/supabase/client";
import {
  normalizeProjectData,
  WELL_KNOWN_MAP_IDS,
} from "~/utils/projectStore";
import type { MapDrawings, MapMarker } from "~/utils/projectStore";
import type { NeighborhoodBorrowGetResponse } from "~/app/api/neighborhood/borrow/route";

export interface BorrowedMapData {
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  bubbleSize: number;
  drawings: MapDrawings;
  markers: MapMarker[];
}

interface SimilarProjectRow {
  projectId: string;
  projectName: string;
  propertyType: string | null;
  city: string | null;
  county: string | null;
  similarityScore: number;
  matchReasons: string[];
  hasExtractedData: boolean;
}

interface SimilarProjectsApiPayload {
  projectId: string;
  similarProjects: SimilarProjectRow[];
}

interface SearchProjectRow {
  id: string;
  name: string;
  property_type: string | null;
}

function coerceBorrowedMapData(
  raw: NonNullable<NeighborhoodBorrowGetResponse["mapData"]>,
): BorrowedMapData {
  const normalized = normalizeProjectData({
    maps: [
      {
        id: WELL_KNOWN_MAP_IDS.neighborhood,
        type: "neighborhood",
        mapCenter: raw.mapCenter,
        mapZoom: raw.mapZoom,
        bubbleSize: raw.bubbleSize,
        hideUI: false,
        documentFrameSize: 1,
        drawings: raw.drawings as Partial<MapDrawings>,
        markers: raw.markers as Partial<MapMarker>[],
      },
    ],
  });
  const m = normalized.maps.find((x) => x.type === "neighborhood");
  if (!m) {
    throw new Error("Failed to normalize borrowed map data");
  }
  return {
    mapCenter: m.mapCenter,
    mapZoom: m.mapZoom,
    bubbleSize: m.bubbleSize,
    drawings: m.drawings,
    markers: m.markers,
  };
}

function drawingSummary(drawings: Record<string, unknown>): {
  polygon: number;
  circles: number;
  labels: number;
} {
  const poly = drawings.polygonPath;
  const polygon = Array.isArray(poly) ? poly.length : 0;
  const circ = drawings.circles;
  const circles = Array.isArray(circ) ? circ.length : 0;
  const lab = drawings.streetLabels;
  const labels = Array.isArray(lab) ? lab.length : 0;
  return { polygon, circles, labels };
}

export interface BorrowNeighborhoodPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onApplyBoundaries: (boundaries: {
    north: string;
    south: string;
    east: string;
    west: string;
  }) => void | Promise<void>;
  onApplyNarrative: (content: string) => void | Promise<void>;
  onApplyMapData: (mapData: BorrowedMapData) => void | Promise<void>;
}

type Step = "pick" | "preview";

type CheckKey = "boundaries" | "narrative" | "mapData" | "mapImage";

const INITIAL_CHECKS: Record<CheckKey, boolean> = {
  boundaries: false,
  narrative: false,
  mapData: false,
  mapImage: false,
};

export function BorrowNeighborhoodPanel({
  projectId,
  isOpen,
  onClose,
  onApplyBoundaries,
  onApplyNarrative,
  onApplyMapData,
}: BorrowNeighborhoodPanelProps) {
  const [step, setStep] = useState<Step>("pick");
  const [similarProjects, setSimilarProjects] = useState<SimilarProjectRow[]>(
    [],
  );
  const [similarLoadError, setSimilarLoadError] = useState<string | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchProjectRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [selectedSource, setSelectedSource] = useState<{
    id: string;
    name: string;
    propertyType: string | null;
  } | null>(null);

  const [preview, setPreview] = useState<NeighborhoodBorrowGetResponse | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [checks, setChecks] = useState<Record<CheckKey, boolean>>(INITIAL_CHECKS);
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);

  const [applyLoading, setApplyLoading] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  const resetAll = useCallback(() => {
    setStep("pick");
    setSimilarProjects([]);
    setSimilarLoadError(null);
    setSimilarLoading(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchLoading(false);
    setSelectedSource(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
    setChecks(INITIAL_CHECKS);
    setNarrativeExpanded(false);
    setApplyLoading(false);
    setBanner(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetAll();
    }
  }, [isOpen, resetAll]);

  useEffect(() => {
    resetAll();
  }, [projectId, resetAll]);

  const loadSimilar = useCallback(async () => {
    setSimilarLoading(true);
    setSimilarLoadError(null);
    try {
      const res = await fetch(
        `/api/suggestions/similar-projects?project_id=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Similar projects failed (${res.status})`);
      }
      const json = (await res.json()) as SimilarProjectsApiPayload;
      const rows = (json.similarProjects ?? []).filter(
        (p) => p.projectId !== projectId,
      );
      setSimilarProjects(rows);
    } catch (e) {
      setSimilarLoadError(
        e instanceof Error ? e.message : "Failed to load similar projects",
      );
    } finally {
      setSimilarLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) return;
    if (step !== "pick") return;
    void loadSimilar();
  }, [isOpen, step, loadSimilar]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const supabase = createClient();
          const result = await supabase
            .from("projects")
            .select("id, name, property_type")
            .ilike("name", `%${q}%`)
            .neq("id", projectId)
            .is("archived_at", null)
            .or("is_reference.is.null,is_reference.eq.false")
            .order("updated_at", { ascending: false })
            .limit(10);

          if (!cancelled) {
            if (result.error) throw result.error;
            setSearchResults((result.data ?? []) as SearchProjectRow[]);
          }
        } catch (e) {
          if (!cancelled) {
            console.error(e);
            setSearchResults([]);
          }
        } finally {
          if (!cancelled) setSearchLoading(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [searchQuery, projectId]);

  const openPreview = useCallback(
    async (id: string, name: string, propertyType: string | null) => {
      setSelectedSource({ id, name, propertyType });
      setStep("preview");
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(true);
      setChecks(INITIAL_CHECKS);
      setNarrativeExpanded(false);
      try {
        const res = await fetch(
          `/api/neighborhood/borrow?source_project_id=${encodeURIComponent(id)}`,
        );
        const body = (await res.json()) as NeighborhoodBorrowGetResponse & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error ?? `Preview failed (${res.status})`);
        }
        setPreview(body);
      } catch (e) {
        setPreviewError(
          e instanceof Error ? e.message : "Failed to load preview",
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [],
  );

  const toggleCheck = useCallback((key: CheckKey, enabled: boolean) => {
    setChecks((prev) => ({ ...prev, [key]: enabled }));
  }, []);

  const availability = useMemo(() => {
    if (!preview) {
      return {
        boundaries: false,
        narrative: false,
        mapData: false,
        mapImage: false,
      };
    }
    return {
      boundaries: preview.boundaries !== null,
      narrative: preview.narrative !== null && preview.narrative.trim().length > 0,
      mapData: preview.mapData !== null,
      mapImage: preview.hasMapImage && Boolean(preview.mapImageFileId),
    };
  }, [preview]);

  const anyChecked = useMemo(
    () =>
      (checks.boundaries && availability.boundaries) ||
      (checks.narrative && availability.narrative) ||
      (checks.mapData && availability.mapData) ||
      (checks.mapImage && availability.mapImage),
    [checks, availability],
  );

  const handleApply = useCallback(async () => {
    if (!preview || !selectedSource || !anyChecked) return;
    setApplyLoading(true);
    setBanner(null);
    try {
      if (checks.boundaries && preview.boundaries) {
        await Promise.resolve(onApplyBoundaries(preview.boundaries));
      }
      if (checks.narrative && preview.narrative) {
        await Promise.resolve(onApplyNarrative(preview.narrative));
      }
      if (checks.mapData && preview.mapData) {
        const coerced = coerceBorrowedMapData(preview.mapData);
        await Promise.resolve(onApplyMapData(coerced));
      }
      if (checks.mapImage && availability.mapImage) {
        const res = await fetch("/api/neighborhood/borrow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceProjectId: selectedSource.id,
            targetProjectId: projectId,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to copy map image");
        }
      }
      setBanner({ kind: "success", text: "Imported selected items." });
      window.setTimeout(() => {
        onClose();
      }, 400);
    } catch (e) {
      setBanner({
        kind: "error",
        text: e instanceof Error ? e.message : "Apply failed",
      });
    } finally {
      setApplyLoading(false);
    }
  }, [
    preview,
    selectedSource,
    anyChecked,
    checks,
    availability.mapImage,
    onApplyBoundaries,
    onApplyNarrative,
    onApplyMapData,
    projectId,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 top-14 flex flex-col border-t border-gray-800 bg-gray-950 shadow-2xl md:inset-x-auto md:inset-y-0 md:right-0 md:top-0 md:w-full md:max-w-md md:border-l md:border-t-0">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 md:px-6 md:py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">
              Borrow from report
            </h2>
            {step === "preview" && selectedSource && (
              <p className="mt-0.5 text-xs text-gray-500">
                From: {selectedSource.name}
              </p>
            )}
            {step === "pick" && (
              <p className="mt-0.5 text-xs text-gray-500">
                Pick a past project to preview boundaries, narrative, map, and
                image.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
            aria-label="Close borrow panel"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {banner && (
          <div
            className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-xs md:mx-6 ${
              banner.kind === "success"
                ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200"
                : "border-red-800/60 bg-red-950/30 text-red-200"
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {step === "pick" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Similar projects
                </h3>
                {similarLoading && (
                  <p className="mt-2 text-xs text-gray-500">Loading…</p>
                )}
                {similarLoadError && (
                  <p className="mt-2 text-xs text-red-300/90">{similarLoadError}</p>
                )}
                {!similarLoading &&
                  similarProjects.length === 0 &&
                  !similarLoadError && (
                    <p className="mt-2 text-xs text-gray-500">
                      No similar projects found yet.
                    </p>
                  )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {similarProjects.map((p) => (
                    <button
                      key={p.projectId}
                      type="button"
                      onClick={() =>
                        void openPreview(
                          p.projectId,
                          p.projectName,
                          p.propertyType,
                        )
                      }
                      className="rounded-full border border-gray-700 bg-gray-900/80 px-3 py-1 text-left text-xs text-gray-200 transition hover:border-blue-600/50 hover:bg-gray-800"
                    >
                      <span className="font-medium">{p.projectName}</span>
                      {p.propertyType && (
                        <span className="ml-1 text-gray-500">
                          · {p.propertyType}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Search projects
                </label>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name…"
                  className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                {searchLoading && (
                  <p className="mt-2 text-xs text-gray-500">Searching…</p>
                )}
                <ul className="mt-2 space-y-1">
                  {searchResults.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() =>
                          void openPreview(
                            row.id,
                            row.name,
                            row.property_type,
                          )
                        }
                        className="flex w-full items-center justify-between rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 text-left text-xs transition hover:border-gray-600 hover:bg-gray-800/60"
                      >
                        <span className="font-medium text-gray-200">
                          {row.name}
                        </span>
                        {row.property_type && (
                          <span className="shrink-0 text-gray-500">
                            {row.property_type}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setStep("pick");
                  setSelectedSource(null);
                  setPreview(null);
                  setPreviewError(null);
                  setChecks(INITIAL_CHECKS);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Back
              </button>

              {previewLoading && (
                <div className="space-y-2 py-8 text-center">
                  <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
                  <p className="text-xs text-gray-500">Loading preview…</p>
                </div>
              )}

              {previewError && (
                <p className="text-sm text-red-300/90">{previewError}</p>
              )}

              {preview && !previewLoading && (
                <>
                  {/* Boundaries */}
                  <label
                    className={`block cursor-pointer rounded-lg border p-3 transition ${
                      checks.boundaries && availability.boundaries
                        ? "border-blue-500/50 bg-blue-950/20"
                        : "border-gray-800 bg-gray-900/40"
                    } ${!availability.boundaries ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-600"
                        disabled={!availability.boundaries}
                        checked={checks.boundaries && availability.boundaries}
                        onChange={(e) =>
                          toggleCheck("boundaries", e.target.checked)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-200">
                          Boundaries
                        </p>
                        {!availability.boundaries ? (
                          <p className="mt-1 text-xs text-gray-500">
                            Not available
                          </p>
                        ) : (
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-400">
                            <span>N: {preview.boundaries?.north ?? ""}</span>
                            <span>S: {preview.boundaries?.south ?? ""}</span>
                            <span>E: {preview.boundaries?.east ?? ""}</span>
                            <span>W: {preview.boundaries?.west ?? ""}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </label>

                  {/* Narrative */}
                  <label
                    className={`block cursor-pointer rounded-lg border p-3 transition ${
                      checks.narrative && availability.narrative
                        ? "border-blue-500/50 bg-blue-950/20"
                        : "border-gray-800 bg-gray-900/40"
                    } ${!availability.narrative ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-600"
                        disabled={!availability.narrative}
                        checked={checks.narrative && availability.narrative}
                        onChange={(e) =>
                          toggleCheck("narrative", e.target.checked)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-200">
                          Analysis narrative
                        </p>
                        {!availability.narrative ? (
                          <p className="mt-1 text-xs text-gray-500">
                            Not available
                          </p>
                        ) : (
                          (() => {
                            const n = preview.narrative;
                            if (n == null) return null;
                            return (
                              <>
                                <p className="mt-2 text-xs leading-relaxed text-gray-400">
                                  {narrativeExpanded || n.length <= 200
                                    ? n
                                    : `${n.slice(0, 200)}…`}
                                </p>
                                {n.length > 200 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setNarrativeExpanded((v) => !v);
                                    }}
                                    className="mt-1 text-xs font-medium text-blue-400 hover:text-blue-300"
                                  >
                                    {narrativeExpanded ? "Show less" : "Preview"}
                                  </button>
                                )}
                              </>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  </label>

                  {/* Map data */}
                  <label
                    className={`block cursor-pointer rounded-lg border p-3 transition ${
                      checks.mapData && availability.mapData
                        ? "border-blue-500/50 bg-blue-950/20"
                        : "border-gray-800 bg-gray-900/40"
                    } ${!availability.mapData ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-600"
                        disabled={!availability.mapData}
                        checked={checks.mapData && availability.mapData}
                        onChange={(e) => toggleCheck("mapData", e.target.checked)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-200">
                          Map data
                        </p>
                        {!availability.mapData || !preview.mapData ? (
                          <p className="mt-1 text-xs text-gray-500">
                            Not available
                          </p>
                        ) : (
                          (() => {
                            const s = drawingSummary(preview.mapData.drawings);
                            return (
                              <p className="mt-2 text-xs text-gray-400">
                                Center: ({preview.mapData.mapCenter.lat.toFixed(4)}
                                , {preview.mapData.mapCenter.lng.toFixed(4)}),
                                Zoom: {preview.mapData.mapZoom},{s.polygon} polygon
                                pts, {s.circles} circles, {s.labels} labels,{" "}
                                {preview.mapData.markers.length} markers
                              </p>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  </label>

                  {/* Map image */}
                  <label
                    className={`block cursor-pointer rounded-lg border p-3 transition ${
                      checks.mapImage && availability.mapImage
                        ? "border-blue-500/50 bg-blue-950/20"
                        : "border-gray-800 bg-gray-900/40"
                    } ${!availability.mapImage ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-600"
                        disabled={!availability.mapImage}
                        checked={checks.mapImage && availability.mapImage}
                        onChange={(e) =>
                          toggleCheck("mapImage", e.target.checked)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-200">
                          Map image
                        </p>
                        {!availability.mapImage ? (
                          <p className="mt-1 text-xs text-gray-500">
                            Not available
                          </p>
                        ) : (
                          preview.mapImageFileId && (
                            // eslint-disable-next-line @next/next/no-img-element -- external Drive thumbnail URL
                            <img
                              src={`https://drive.google.com/thumbnail?id=${encodeURIComponent(preview.mapImageFileId)}&sz=w200`}
                              alt="Neighborhood map preview"
                              className="mt-2 h-auto max-w-full rounded border border-gray-800"
                            />
                          )
                        )}
                      </div>
                    </div>
                  </label>
                </>
              )}
            </div>
          )}
        </div>

        {step === "preview" && preview && !previewLoading && (
          <div className="border-t border-gray-800 p-4 md:px-6 md:py-4">
            <button
              type="button"
              disabled={!anyChecked || applyLoading}
              onClick={() => void handleApply()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applyLoading ? "Applying…" : "Apply selected"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface BorrowPanelToggleProps {
  onClick: () => void;
}

export function BorrowPanelToggle({ onClick }: BorrowPanelToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:border-gray-600 hover:bg-gray-800 hover:text-gray-200"
      title="Borrow neighborhood content from another project"
    >
      <ArrowDownOnSquareIcon className="h-3.5 w-3.5" />
      Borrow
    </button>
  );
}
