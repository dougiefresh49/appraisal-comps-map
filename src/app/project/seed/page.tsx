"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
} from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "~/hooks/useAuth";
import { normalizeProjectData } from "~/utils/projectStore";

interface SeedResult {
  message?: string;
  error?: string;
  imported?: number;
  total?: number;
  results?: { file: string; sectionsExtracted: number; error?: string }[];
}

interface LegacyJsonImportResponse {
  maps?: number;
  markers?: number;
  compsDisplayUpdated?: number;
  compMatches?: { legacyId: string; dbId: string; matchType: string }[];
  unmatchedLegacyComps?: string[];
  error?: string;
}

interface BackfillCompsResponse {
  ok?: boolean;
  error?: string;
  phaseA?: { discovered: number; skipped: number; errors: string[] };
  phaseB?: {
    compsAssigned: number;
    parcelsCreated: number;
    improvementsCreated: number;
    errors: string[];
  };
  phaseC?: { compsCreated: number; errors: string[] };
  phaseD?: { historicalMarked: number };
  phaseE?: { apnPatched: number; folderFound: number; imagesFound: number; errors: string[] };
  elapsed_ms?: number;
}

function CompBackfillPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [force, setForce] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<BackfillCompsResponse | null>(null);

  const runBackfill = async (phaseOverride?: string) => {
    setIsRunning(true);
    setResult(null);
    const p = phaseOverride ?? "all";
    setProgress(p === "E" ? "Running Phase E (enrich)…" : "Starting Phase A…");
    try {
      const res = await fetch("/api/seed/backfill-comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: p, force }),
      });
      const data = (await res.json()) as BackfillCompsResponse;
      if (!res.ok) {
        setProgress(null);
        setResult({
          error: (data as { error?: string }).error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setProgress(p === "E" ? "Done (Phase E)." : "Done (A → E).");
      setResult(data);
    } catch (err) {
      setProgress(null);
      setResult({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const allErrors = [
    ...(result?.phaseA?.errors ?? []),
    ...(result?.phaseB?.errors ?? []),
    ...(result?.phaseC?.errors ?? []),
    ...(result?.phaseE?.errors ?? []),
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Comp Backfill &amp; Cleanup
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Re-assign Reference Library comps to per-project references, create
          comps from extracted report data, and discover Drive folders.
        </p>
      </div>

      <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
          disabled={isRunning}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        Force re-run (re-discover{" "}
        <code className="text-xs">folder_structure</code> even if set)
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void runBackfill()}
          disabled={isRunning}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-gray-600"
        >
          {isRunning ? "Running…" : "Run Full Backfill (A–E)"}
        </button>
        <button
          type="button"
          onClick={() => void runBackfill("E")}
          disabled={isRunning}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 dark:disabled:bg-gray-600"
        >
          {isRunning ? "Running…" : "Enrich Only (APN + Folders + Images)"}
        </button>
      </div>

      {progress && !result?.error && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{progress}</p>
      )}

      {result && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            result.error
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          }`}
        >
          {result.error && <p className="font-medium">Error: {result.error}</p>}
          {!result.error && result.ok && (
            <>
              <p className="font-medium text-gray-900 dark:text-gray-100">Summary</p>
              <ul className="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                <li>
                  Phase A — discovered: {result.phaseA?.discovered ?? 0}, skipped:{" "}
                  {result.phaseA?.skipped ?? 0}
                </li>
                <li>
                  Phase B — comps assigned: {result.phaseB?.compsAssigned ?? 0},
                  parcels: {result.phaseB?.parcelsCreated ?? 0}, improvements:{" "}
                  {result.phaseB?.improvementsCreated ?? 0}
                </li>
                <li>Phase C — comps created: {result.phaseC?.compsCreated ?? 0}</li>
                <li>
                  Phase D — historical marked:{" "}
                  {result.phaseD?.historicalMarked ?? 0}
                </li>
                <li>
                  Phase E — APN patched: {result.phaseE?.apnPatched ?? 0},
                  folders found: {result.phaseE?.folderFound ?? 0}, images
                  found: {result.phaseE?.imagesFound ?? 0}
                </li>
                {result.elapsed_ms !== undefined && (
                  <li>
                    Elapsed: {(result.elapsed_ms / 1000).toFixed(1)}s
                  </li>
                )}
              </ul>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-400">
                  Raw JSON
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </>
          )}
        </div>
      )}

      {allErrors.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Phase warnings / errors</p>
          <ul className="mt-1 max-h-36 list-disc space-y-0.5 overflow-y-auto pl-4">
            {allErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function unwrapLegacyExport(parsed: unknown): {
  wrapperName: string | null;
  inner: Record<string, unknown>;
} {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      wrapperName: null,
      inner: (parsed as Record<string, unknown>) ?? {},
    };
  }
  const keys = Object.keys(parsed as Record<string, unknown>);
  if (keys.length === 1) {
    const outerKey = keys[0]!;
    const innerVal = (parsed as Record<string, unknown>)[outerKey];
    if (
      innerVal &&
      typeof innerVal === "object" &&
      !Array.isArray(innerVal)
    ) {
      const o = innerVal as Record<string, unknown>;
      if ("subject" in o || "location" in o || "comparables" in o) {
        return { wrapperName: outerKey, inner: o };
      }
    }
  }
  return { wrapperName: null, inner: parsed as Record<string, unknown> };
}

function ImportLegacyLocalStoragePanel() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [wrapperName, setWrapperName] = useState<string | null>(null);
  const [legacyInner, setLegacyInner] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<LegacyJsonImportResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setProjectsLoading(true);
      setProjectsError(null);
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        );
        const { data, error } = await supabase
          .from("projects")
          .select("id, name")
          .is("archived_at", null)
          .order("name", { ascending: true });
        if (error) throw error;
        if (!cancelled) {
          setProjects(
            (data ?? []) as { id: string; name: string }[],
          );
        }
      } catch (e) {
        if (!cancelled) {
          setProjectsError(
            e instanceof Error ? e.message : "Failed to load projects",
          );
          setProjects([]);
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setResult(null);
    setLegacyInner(null);
    setPreviewText(null);
    setParseError(null);
    setWrapperName(null);
    setFileLabel(file?.name ?? null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        const parsed: unknown = JSON.parse(text);
        const { wrapperName: wn, inner } = unwrapLegacyExport(parsed);
        setWrapperName(wn);
        setLegacyInner(inner);

        const normalized = normalizeProjectData(inner);
        const land = normalized.comparables.filter((c) => c.type === "Land")
          .length;
        const sales = normalized.comparables.filter((c) => c.type === "Sales")
          .length;
        const rentals = normalized.comparables.filter(
          (c) => c.type === "Rentals",
        ).length;
        const mapCount = normalized.maps.length;
        setPreviewText(
          `${land} Land, ${sales} Sales, ${rentals} Rental comps (will match for display name update where possible), ${mapCount} maps`,
        );
        setParseError(null);
      } catch (err) {
        setLegacyInner(null);
        setPreviewText(null);
        setParseError(
          err instanceof Error ? err.message : "Could not parse JSON",
        );
      }
    };
    reader.onerror = () => {
      setParseError("Failed to read file");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const runImport = async () => {
    if (!projectId.trim() || !legacyInner) return;
    setIsImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed/import-legacy-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId.trim(),
          legacyJson: legacyInner,
        }),
      });
      const data = (await res.json()) as LegacyJsonImportResponse;
      if (!res.ok) {
        setResult({ error: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setResult(data);
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const canImport =
    Boolean(projectId.trim() && legacyInner && !parseError && previewText);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Import Legacy JSON Map Data
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Upload an export from the old app. Imports all map data (shapes,
          markers, drawings, labels) and updates{" "}
          <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
            addressForDisplay
          </code>{" "}
          on matched comparables. Does not create or overwrite existing
          comparable data.
        </p>
      </div>

      {projectsLoading ? (
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          Loading projects…
        </p>
      ) : projectsError ? (
        <p className="mb-3 text-sm text-red-700 dark:text-red-300">
          {projectsError}
        </p>
      ) : (
        <label className="mb-3 block text-sm text-gray-700 dark:text-gray-300">
          <span className="mb-1 block font-medium">Target project</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={isImporting}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mb-3 block text-sm text-gray-700 dark:text-gray-300">
        <span className="mb-1 block font-medium">
          Legacy JSON file (.json)
        </span>
        <input
          type="file"
          accept=".json,application/json"
          onChange={onFileChange}
          disabled={isImporting}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700 dark:text-gray-400"
        />
      </label>

      {fileLabel && (
        <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
          File: <span className="font-medium">{fileLabel}</span>
        </p>
      )}

      {wrapperName && (
        <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
          Detected wrapper key:{" "}
          <span className="font-medium text-gray-800 dark:text-gray-200">
            {wrapperName}
          </span>
        </p>
      )}

      {parseError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {parseError}
        </div>
      )}

      {previewText && !parseError && (
        <p className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-200">
          Preview: {previewText}
        </p>
      )}

      <button
        type="button"
        onClick={() => void runImport()}
        disabled={!canImport || isImporting || projectsLoading || !!projectsError}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-gray-600"
      >
        {isImporting ? "Importing…" : "Import"}
      </button>

      {result && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            result.error
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          }`}
        >
          {result.error && <p>Error: {result.error}</p>}
          {!result.error &&
            result.maps !== undefined &&
            result.markers !== undefined && (
              <>
                <p className="font-medium">Import complete</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                  <li>Maps imported: {result.maps}</li>
                  <li>Markers imported: {result.markers}</li>
                  <li>
                    Comp display names updated:{" "}
                    {result.compsDisplayUpdated ?? 0}
                  </li>
                </ul>
                {result.unmatchedLegacyComps &&
                  result.unmatchedLegacyComps.length > 0 && (
                    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      <p className="font-medium">
                        No DB match (display name not updated)
                      </p>
                      <ul className="mt-1 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4">
                        {result.unmatchedLegacyComps.map((addr, i) => (
                          <li key={i}>{addr}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                {result.compMatches && result.compMatches.length > 0 && (
                  <details className="mt-2 text-xs text-gray-700 dark:text-gray-300">
                    <summary className="cursor-pointer font-medium text-gray-800 dark:text-gray-200">
                      Comp matches ({result.compMatches.length})
                    </summary>
                    <ul className="mt-1 max-h-36 list-disc space-y-0.5 overflow-y-auto pl-4 font-mono text-[11px]">
                      {result.compMatches.map((m, i) => (
                        <li key={i}>
                          {m.matchType}: {m.legacyId.slice(0, 12)}… →{" "}
                          {m.dbId.slice(0, 8)}…
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
        </div>
      )}
    </div>
  );
}

interface PatternResult {
  message?: string;
  error?: string;
  stored?: string[];
  errors?: string[];
  patterns_summary?: {
    total_reports: number;
    land_categories: number;
    sale_categories: number;
    rental_categories: number;
    common_categories: string[];
  };
  // shape when viewing patterns (GET)
  total_reports_analyzed?: number;
  land_patterns?: unknown[];
  sale_patterns?: unknown[];
  rental_patterns?: unknown[];
  common_adjustment_categories?: string[];
}

function SeedButton({
  label,
  description,
  endpoint,
}: {
  label: string;
  description: string;
  endpoint: string;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const data = (await response.json()) as SeedResult;
      setResult(data);
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{label}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={isRunning}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {isRunning ? "Running..." : "Run"}
      </button>

      {result && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            result.error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {result.error && <p>Error: {result.error}</p>}
          {result.message && <p>{result.message}</p>}
          {result.imported !== undefined && (
            <p>
              Imported: {result.imported} / {result.total}
            </p>
          )}
          {result.results && (
            <div className="mt-2 space-y-1">
              {result.results.map((r, i) => (
                <div key={i} className="text-xs">
                  {r.file}: {r.sectionsExtracted} sections
                  {r.error ? ` (error: ${r.error})` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DiscussionBackfillResult {
  processed?: number;
  inserted?: {
    "discussion-of-land-sales"?: number;
    "discussion-of-improved-sales"?: number;
  };
  skipped?: string[];
  errors?: string[];
  elapsed_ms?: number;
  error?: string;
}

interface DiscussionBackfillListResponse {
  files?: string[];
  error?: string;
}

function DiscussionBackfillPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DiscussionBackfillResult | null>(null);
  const [reportFiles, setReportFiles] = useState<string[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch("/api/seed/backfill-discussion-sections");
        const data = (await res.json()) as DiscussionBackfillListResponse;
        if (!res.ok) {
          if (!cancelled) {
            setListError(data.error ?? `HTTP ${res.status}`);
            setReportFiles([]);
          }
          return;
        }
        if (!cancelled) {
          setReportFiles(data.files ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setListError(e instanceof Error ? e.message : "Failed to load file list");
          setReportFiles([]);
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFile = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAllFiles = () => {
    setSelectedNames(new Set(reportFiles));
  };

  const clearSelection = () => {
    setSelectedNames(new Set());
  };

  const postBackfill = async (body: Record<string, unknown>) => {
    setIsRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed/backfill-discussion-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as DiscussionBackfillResult;
      if (!res.ok) {
        setResult({ error: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setResult(data);
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const runAll = () => void postBackfill({});

  const runSelected = () => {
    if (selectedNames.size === 0) return;
    void postBackfill({
      md_filenames: [...selectedNames].sort(),
      force: overwriteExisting,
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Backfill Discussion Sections
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Extract Discussion of Land Sales / Improved Sales from past report
          markdown into{" "}
          <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
            report_sections
          </code>{" "}
          with embeddings. No AI needed — uses heading-based extraction.
        </p>
      </div>

      {listLoading ? (
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          Loading report file list…
        </p>
      ) : listError ? (
        <p className="mb-3 text-sm text-red-700 dark:text-red-300">{listError}</p>
      ) : (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
            Select reports (or use Run all)
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllFiles}
              disabled={isRunning || reportFiles.length === 0}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={isRunning || selectedNames.size === 0}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Clear
            </button>
          </div>
          <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-800">
            {reportFiles.map((name) => (
              <label
                key={name}
                className="flex cursor-pointer items-start gap-2 text-xs text-gray-800 dark:text-gray-200"
              >
                <input
                  type="checkbox"
                  checked={selectedNames.has(name)}
                  onChange={() => toggleFile(name)}
                  disabled={isRunning}
                  className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                />
                <span className="break-all">{name}</span>
              </label>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
              disabled={isRunning}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Overwrite existing discussion rows (re-embed after markdown edits)
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runAll}
          disabled={isRunning || listLoading || !!listError}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-gray-600"
        >
          {isRunning ? "Running..." : "Run all reports"}
        </button>
        <button
          type="button"
          onClick={runSelected}
          disabled={
            isRunning ||
            listLoading ||
            !!listError ||
            selectedNames.size === 0
          }
          className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:disabled:bg-gray-600"
        >
          Run selected ({selectedNames.size})
        </button>
      </div>

      {result && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            result.error
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          }`}
        >
          {result.error && <p>Error: {result.error}</p>}
          {result.processed !== undefined && (
            <p>Processed {result.processed} file(s)</p>
          )}
          {result.inserted && (
            <p className="mt-1 text-xs">
              Land: {result.inserted["discussion-of-land-sales"] ?? 0} · Improved:{" "}
              {result.inserted["discussion-of-improved-sales"] ?? 0}
            </p>
          )}
          {result.elapsed_ms !== undefined && (
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Elapsed: {(result.elapsed_ms / 1000).toFixed(1)}s
            </p>
          )}
          {result.skipped && result.skipped.length > 0 && (
            <details className="mt-2 text-xs text-gray-700 dark:text-gray-300">
              <summary className="cursor-pointer font-medium">
                Skipped ({result.skipped.length})
              </summary>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4">
                {result.skipped.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          )}
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-700 dark:text-red-300">
              <p className="font-medium">Errors:</p>
              {result.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface NeighborhoodBackfillResult {
  processed?: number;
  boundaries_updated?: number;
  sections_updated?: number;
  skipped?: string[];
  errors?: string[];
  elapsed_ms?: number;
  error?: string;
}

function NeighborhoodBackfillPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<NeighborhoodBackfillResult | null>(null);
  const [force, setForce] = useState(false);

  const run = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed/backfill-neighborhood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = (await res.json()) as NeighborhoodBackfillResult;
      if (!res.ok) {
        setResult({ error: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setResult(data);
    } catch (e) {
      setResult({
        error: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Backfill Neighborhood Boundaries
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Re-extracts the full{" "}
        <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
          #### Boundaries
        </code>{" "}
        section from each report markdown file, uses Gemini flash-lite to
        parse N/S/E/W strings into{" "}
        <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
          subject_data.core.neighborhoodBoundaries
        </code>
        , and replaces truncated{" "}
        <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
          report_sections
        </code>{" "}
        neighborhood rows with the full narrative (re-embedded).
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void run()}
          disabled={isRunning}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-gray-600"
        >
          {isRunning ? "Running…" : "Run backfill"}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            disabled={isRunning}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Force overwrite existing
        </label>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-md border p-3 text-sm ${
            result.error
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          }`}
        >
          {result.error && <p>Error: {result.error}</p>}
          {result.boundaries_updated !== undefined &&
            result.sections_updated !== undefined &&
            result.processed !== undefined && (
              <p className="text-gray-800 dark:text-gray-200">
                Boundaries updated: {result.boundaries_updated} · Sections
                updated: {result.sections_updated} · Processed:{" "}
                {result.processed}
                {result.elapsed_ms !== undefined &&
                  ` · ${(result.elapsed_ms / 1000).toFixed(1)}s`}
              </p>
            )}
          {result.skipped && result.skipped.length > 0 && (
            <details className="mt-2 text-xs text-gray-700 dark:text-gray-300">
              <summary className="cursor-pointer font-medium">
                Skipped ({result.skipped.length})
              </summary>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4">
                {result.skipped.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          )}
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-700 dark:text-red-300">
              <p className="font-medium">Errors:</p>
              {result.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ReportDueDateBackfillResult {
  processed?: number;
  updated?: number;
  skipped?: string[];
  errors?: string[];
  elapsed_ms?: number;
  error?: string;
}

function ReportDueDateBackfillPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ReportDueDateBackfillResult | null>(
    null,
  );
  const [reportFiles, setReportFiles] = useState<string[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch("/api/seed/backfill-report-due-dates");
        const data = (await res.json()) as DiscussionBackfillListResponse;
        if (!res.ok) {
          if (!cancelled) {
            setListError(data.error ?? `HTTP ${res.status}`);
            setReportFiles([]);
          }
          return;
        }
        if (!cancelled) {
          setReportFiles(data.files ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setListError(
            e instanceof Error ? e.message : "Failed to load file list",
          );
          setReportFiles([]);
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFile = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAllFiles = () => {
    setSelectedNames(new Set(reportFiles));
  };

  const clearSelection = () => {
    setSelectedNames(new Set());
  };

  const postBackfill = async (body: Record<string, unknown>) => {
    setIsRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed/backfill-report-due-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ReportDueDateBackfillResult;
      if (!res.ok) {
        setResult({ error: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setResult(data);
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const runAll = () => void postBackfill({});

  const runSelected = () => {
    if (selectedNames.size === 0) return;
    void postBackfill({
      md_filenames: [...selectedNames].sort(),
      force: overwriteExisting,
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Backfill report due dates
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Reads{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            DATE OF REPORT
          </span>{" "}
          under{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            SIGNIFICANT APPRAISAL DATES
          </span>{" "}
          in each past-report markdown file and sets{" "}
          <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
            projects.report_due_date
          </code>{" "}
          as <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">MM/dd/yyyy</code>{" "}
          (via date-fns). Matches projects using{" "}
          <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
            report_extracted_data.source_filename
          </code>
          .
        </p>
      </div>

      {listLoading ? (
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          Loading report file list…
        </p>
      ) : listError ? (
        <p className="mb-3 text-sm text-red-700 dark:text-red-300">{listError}</p>
      ) : (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
            Select reports (or use Run all)
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllFiles}
              disabled={isRunning || reportFiles.length === 0}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={isRunning || selectedNames.size === 0}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Clear
            </button>
          </div>
          <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-800">
            {reportFiles.map((name) => (
              <label
                key={name}
                className="flex cursor-pointer items-start gap-2 text-xs text-gray-800 dark:text-gray-200"
              >
                <input
                  type="checkbox"
                  checked={selectedNames.has(name)}
                  onChange={() => toggleFile(name)}
                  disabled={isRunning}
                  className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                />
                <span className="break-all">{name}</span>
              </label>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
              disabled={isRunning}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Overwrite existing <code className="text-xs">report_due_date</code>{" "}
            values
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runAll}
          disabled={isRunning || listLoading || !!listError}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-gray-600"
        >
          {isRunning ? "Running..." : "Run all reports"}
        </button>
        <button
          type="button"
          onClick={runSelected}
          disabled={
            isRunning ||
            listLoading ||
            !!listError ||
            selectedNames.size === 0
          }
          className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:disabled:bg-gray-600"
        >
          Run selected ({selectedNames.size})
        </button>
      </div>

      {result && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            result.error
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          }`}
        >
          {result.error && <p>Error: {result.error}</p>}
          {result.processed !== undefined && (
            <p>Processed {result.processed} file(s)</p>
          )}
          {result.updated !== undefined && (
            <p className="mt-1 text-xs">
              Updated projects: {result.updated}
            </p>
          )}
          {result.elapsed_ms !== undefined && (
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Elapsed: {(result.elapsed_ms / 1000).toFixed(1)}s
            </p>
          )}
          {result.skipped && result.skipped.length > 0 && (
            <details className="mt-2 text-xs text-gray-700 dark:text-gray-300">
              <summary className="cursor-pointer font-medium">
                Skipped ({result.skipped.length})
              </summary>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4">
                {result.skipped.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          )}
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-700 dark:text-red-300">
              <p className="font-medium">Errors:</p>
              {result.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ImportResult {
  message?: string;
  error?: string;
  elapsed_ms?: number;
  results?: {
    projectName: string;
    fileMode: "markdown" | "pdf" | "no_file";
    backfill: "triggered" | "skipped" | "no_file";
    backfillDetail?: string;
    action: "created" | "existing";
  }[];
}

function ForceImportPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleRun = async (executeOnce: boolean) => {
    setIsRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed/import-old-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, execute_once: executeOnce }),
      });
      const data = (await res.json()) as ImportResult;
      setResult(data);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900">
          Force Re-import All Reference Projects
        </h3>
        <p className="text-sm text-gray-500">
          Clears and re-runs Pass 1 + Pass 2 backfill for all 11 reference projects
          using markdown files (preferred over PDF). Populates{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">report_extracted_data</code>{" "}
          with comp data, adjustment grids, cost approach, and reconciliation.{" "}
          <strong className="text-amber-700">~6–10 minutes</strong> — watch the dev server console.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleRun(true)}
          disabled={isRunning}
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isRunning ? "Running..." : "Test (1 project)"}
        </button>
        <button
          type="button"
          onClick={() => void handleRun(false)}
          disabled={isRunning}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
        >
          {isRunning ? "Running (this takes ~10 min)..." : "Force Re-import All 11"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            result.error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {result.error && <p>Error: {result.error}</p>}
          {result.message && <p>{result.message}</p>}
          {result.elapsed_ms !== undefined && (
            <p className="text-xs text-gray-500">
              Elapsed: {(result.elapsed_ms / 1000).toFixed(1)}s
            </p>
          )}
          {result.results && result.results.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span
                    className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                      r.backfill === "triggered"
                        ? "bg-green-500"
                        : r.backfill === "no_file"
                          ? "bg-gray-400"
                          : "bg-red-500"
                    }`}
                  />
                  <span>
                    <span className="font-medium">{r.projectName}</span>{" "}
                    <span className="text-gray-500">
                      ({r.fileMode}, {r.backfill})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PatternsPanel() {
  const [isViewing, setIsViewing] = useState(false);
  const [isStoring, setIsStoring] = useState(false);
  const [viewResult, setViewResult] = useState<PatternResult | null>(null);
  const [storeResult, setStoreResult] = useState<PatternResult | null>(null);

  const handleView = async () => {
    setIsViewing(true);
    setViewResult(null);
    try {
      const res = await fetch("/api/seed/extract-patterns");
      const data = (await res.json()) as PatternResult;
      setViewResult(data);
    } catch (err) {
      setViewResult({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setIsViewing(false);
    }
  };

  const handleStore = async () => {
    setIsStoring(true);
    setStoreResult(null);
    try {
      const res = await fetch("/api/seed/extract-patterns", { method: "POST" });
      const data = (await res.json()) as PatternResult;
      setStoreResult(data);
    } catch (err) {
      setStoreResult({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setIsStoring(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900">
          Adjustment Pattern Analyzer
        </h3>
        <p className="text-sm text-gray-500">
          Analyze{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">
            report_extracted_data
          </code>{" "}
          across all reference projects to identify common adjustment categories,
          typical ranges, and property-type-specific patterns. Requires a
          completed backfill.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleView}
          disabled={isViewing || isStoring}
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isViewing ? "Loading..." : "View Patterns"}
        </button>
        <button
          type="button"
          onClick={handleStore}
          disabled={isViewing || isStoring}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isStoring ? "Storing..." : "Store Patterns in Knowledge Base"}
        </button>
      </div>

      {storeResult && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            storeResult.error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {storeResult.error && <p>Error: {storeResult.error}</p>}
          {storeResult.message && <p>{storeResult.message}</p>}
          {storeResult.stored && storeResult.stored.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {storeResult.stored.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {storeResult.patterns_summary && (
            <div className="mt-2 text-xs text-gray-600">
              <p>Reports analyzed: {storeResult.patterns_summary.total_reports}</p>
              <p>
                Categories — Land: {storeResult.patterns_summary.land_categories}, Sales:{" "}
                {storeResult.patterns_summary.sale_categories}, Rental:{" "}
                {storeResult.patterns_summary.rental_categories}
              </p>
              {storeResult.patterns_summary.common_categories.length > 0 && (
                <p>
                  Common (&gt;50%): {storeResult.patterns_summary.common_categories.join(", ")}
                </p>
              )}
            </div>
          )}
          {storeResult.errors && storeResult.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-700">
              <p className="font-medium">Errors:</p>
              {storeResult.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {viewResult && (
        <div className="mt-3">
          {viewResult.error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Error: {viewResult.error}
            </div>
          ) : (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium text-gray-600">
                Pattern Summary — {viewResult.total_reports_analyzed} reports analyzed
              </p>
              {viewResult.common_adjustment_categories &&
                viewResult.common_adjustment_categories.length > 0 && (
                  <p className="mb-2 text-xs text-gray-600">
                    Common categories (&gt;50%): {viewResult.common_adjustment_categories.join(", ")}
                  </p>
                )}
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  View full JSON ({JSON.stringify(viewResult).length.toLocaleString()} chars)
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-gray-900 p-3 text-gray-100">
                  {JSON.stringify(viewResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PhotoBackfillSummaryRow {
  project_id: string;
  project_name: string;
  total_in_db: number;
  drive_image_count: number | null;
  has_photos: boolean;
  status: "none" | "partial" | "complete";
}

interface PhotoBackfillListResponse {
  projects?: PhotoBackfillSummaryRow[];
  drive_authenticated?: boolean;
  error?: string;
}

interface PhotoBackfillPostResult {
  project_name: string;
  project_id: string;
  success: boolean;
  skipped?: boolean;
  totalPhotos?: number;
  error?: string;
  existing_analyses?: number;
}

interface PhotoBackfillPostResponse {
  message?: string;
  error?: string;
  results?: PhotoBackfillPostResult[];
}

async function waitForPhotoAnalysisProgress(
  projectId: string,
  expectedTotal: number,
  onTick: (analyzed: number) => void,
): Promise<number> {
  for (;;) {
    const res = await fetch(
      `/api/seed/reference-photo-analysis?project_id=${encodeURIComponent(projectId)}`,
    );
    const data = (await res.json()) as {
      analyzed_photos?: number;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }

    const analyzed = data.analyzed_photos ?? 0;
    onTick(analyzed);

    if (expectedTotal === 0 || analyzed >= expectedTotal) {
      return analyzed;
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
}

function PhotoBackfillPanel() {
  const { signIn } = useAuth();
  const [rows, setRows] = useState<PhotoBackfillSummaryRow[]>([]);
  const [driveAuthenticated, setDriveAuthenticated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [force, setForce] = useState(false);
  const [runAllProgress, setRunAllProgress] = useState<string | null>(null);
  const [rowNote, setRowNote] = useState<Record<string, string | null>>({});
  const [isRunning, setIsRunning] = useState(false);

  const fetchList = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/seed/reference-photo-analysis");
      const data = (await res.json()) as PhotoBackfillListResponse;
      if (!res.ok) {
        setLoadError(data.error ?? `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      setRows(data.projects ?? []);
      setDriveAuthenticated(data.drive_authenticated === true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Request failed");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoadingList(true);
      await fetchList();
      setLoadingList(false);
    })();
  }, [fetchList]);

  const setNote = (projectId: string, message: string | null) => {
    setRowNote((m) => ({ ...m, [projectId]: message }));
  };

  const runOne = async (row: PhotoBackfillSummaryRow) => {
    if (isRunning) return;
    setIsRunning(true);
    setNote(row.project_id, null);

    try {
      const res = await fetch("/api/seed/reference-photo-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: row.project_id, force }),
      });
      const data = (await res.json()) as PhotoBackfillPostResponse;
      if (!res.ok) {
        setNote(row.project_id, data.error ?? `HTTP ${res.status}`);
        return;
      }

      const hit = data.results?.[0];
      if (hit?.skipped) {
        setNote(
          row.project_id,
          hit.error ?? "Skipped (already has photo_analyses). Enable force to re-run.",
        );
        await fetchList();
        return;
      }

      if (!hit?.success) {
        setNote(row.project_id, hit?.error ?? data.error ?? "Trigger failed");
        return;
      }

      const total = hit.totalPhotos ?? 0;
      setNote(row.project_id, `Queued — ${total} photo(s) in Drive`);

      const analyzed = await waitForPhotoAnalysisProgress(
        row.project_id,
        total,
        (n) => {
          setNote(
            row.project_id,
            `Analyzing… ${n} / ${total}`,
          );
        },
      );

      setNote(row.project_id, `Done — ${analyzed} photo(s) analyzed`);
      await fetchList();
    } catch (e) {
      setNote(
        row.project_id,
        e instanceof Error ? e.message : "Request failed",
      );
    } finally {
      setIsRunning(false);
    }
  };

  const runAllMissing = async () => {
    if (isRunning) return;
    const missing = rows.filter((r) => r.total_in_db === 0);
    if (missing.length === 0) {
      setRunAllProgress("No projects with 0 rows in photo_analyses.");
      setTimeout(() => setRunAllProgress(null), 4000);
      return;
    }

    if (!driveAuthenticated) {
      setRunAllProgress("Sign in with Google first (Drive access required).");
      setTimeout(() => setRunAllProgress(null), 5000);
      return;
    }

    setIsRunning(true);
    try {
      for (let i = 0; i < missing.length; i++) {
        const row = missing[i]!;
        const totalInBatch = missing.length;
        try {
          setRunAllProgress(
            `Processing ${i + 1}/${totalInBatch} — ${row.project_name}…`,
          );
          setNote(row.project_id, "Starting…");

          const res = await fetch("/api/seed/reference-photo-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: row.project_id, force }),
          });
          const data = (await res.json()) as PhotoBackfillPostResponse;
          const hit = data.results?.[0];

          if (!res.ok) {
            setNote(row.project_id, data.error ?? `HTTP ${res.status}`);
            continue;
          }

          if (hit?.skipped) {
            setNote(row.project_id, hit.error ?? "Skipped");
            await fetchList();
            continue;
          }

          if (!hit?.success) {
            setNote(row.project_id, hit?.error ?? "Trigger failed");
            continue;
          }

          const total = hit.totalPhotos ?? 0;
          setNote(row.project_id, `Queued — ${total} photo(s)`);

          const analyzed = await waitForPhotoAnalysisProgress(
            row.project_id,
            total,
            (n) => {
              setRunAllProgress(
                `Processing ${i + 1}/${totalInBatch} — ${row.project_name} (${n}/${total} photos)`,
              );
              setNote(row.project_id, `Analyzing… ${n} / ${total}`);
            },
          );

          setNote(row.project_id, `Done — ${analyzed} photo(s)`);

          await fetchList();
        } finally {
          if (i < missing.length - 1) {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      }
    } finally {
      setRunAllProgress(null);
      setIsRunning(false);
    }
  };

  const busy = isRunning;
  const statusBadge = (r: PhotoBackfillSummaryRow) => {
    const label =
      r.status === "none"
        ? "None"
        : r.status === "complete"
          ? "Complete"
          : "Partial";
    const cls =
      r.status === "none"
        ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
        : r.status === "complete"
          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
        {label}
      </span>
    );
  };

  const driveLabel =
    rows.length > 0
      ? `${rows.filter((r) => r.status === "complete").length}/${rows.length} complete (by Drive count)`
      : "";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Reference photo analysis backfill
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Queue Gemini classify + describe for subject photos on all{" "}
          <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
            is_reference
          </code>{" "}
          projects. Replaces n8n backfill; processes in small batches in-app.
          Requires an active Google session with Drive access.
        </p>
        {driveLabel && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
            {driveLabel}
          </p>
        )}
      </div>

      {!loadingList && !driveAuthenticated && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Google Drive not available in this session</p>
          <p className="mt-1">
            Sign in with Google so the server can read subject photo folders.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void signIn("/project/seed")}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sign in with Google
            </button>
            <a
              href="/login"
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Open login
            </a>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Force re-analyze (ignore existing{" "}
          <code className="text-xs">photo_analyses</code> rows)
        </label>
        <button
          type="button"
          onClick={() => void fetchList()}
          disabled={loadingList || busy}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
        >
          Refresh list
        </button>
        <button
          type="button"
          onClick={() => void runAllMissing()}
          disabled={loadingList || busy || !driveAuthenticated}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-gray-600"
        >
          Run all missing
        </button>
      </div>

      {runAllProgress && (
        <p className="mb-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950/50 dark:text-blue-100">
          {runAllProgress}
        </p>
      )}

      {loadError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </div>
      )}

      {loadingList ? (
        <p className="text-sm text-gray-500">Loading reference projects…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          No reference projects found (<code>is_reference = true</code>).
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/80">
              <tr>
                <th className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                  Project
                </th>
                <th className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                  In DB
                </th>
                <th className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                  Drive images
                </th>
                <th className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                  Status
                </th>
                <th className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                  Run
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {rows.map((r) => (
                <tr
                  key={r.project_id}
                  className="bg-white dark:bg-gray-950/40"
                >
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                    {r.project_name}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                    {r.total_in_db}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                    {r.drive_image_count ?? "—"}
                  </td>
                  <td className="px-3 py-2">{statusBadge(r)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => void runOne(r)}
                        disabled={busy || !driveAuthenticated}
                        className="rounded-md bg-gray-800 px-2 py-1 text-xs font-medium text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:disabled:bg-gray-600"
                      >
                        Run
                      </button>
                      {rowNote[r.project_id] && (
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {rowNote[r.project_id]}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface PhotoLabelsBackfillResultRow {
  project_id: string;
  project_name: string;
  md_file: string | null;
  label_count: number;
  photo_count: number;
  mode: "positional" | "gemini" | "skipped";
  updated: number;
  errors?: string[];
}

interface PhotoLabelsBackfillResponse {
  success?: boolean;
  dry_run?: boolean;
  results?: PhotoLabelsBackfillResultRow[];
  error?: string;
}

interface PhotoLabelsProjectsResponse {
  projects?: { id: string; name: string }[];
  error?: string;
}

function PhotoLabelsFromReportsPanel() {
  const { signIn } = useAuth();
  const [mapProjects, setMapProjects] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [forceGemini, setForceGemini] = useState(false);
  const [usePositional, setUsePositional] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PhotoLabelsBackfillResponse | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch("/api/seed/backfill-photo-labels");
        const data = (await res.json()) as PhotoLabelsProjectsResponse;
        if (!res.ok) {
          if (!cancelled) {
            setListError(data.error ?? `HTTP ${res.status}`);
            setMapProjects([]);
          }
          return;
        }
        if (!cancelled) {
          setMapProjects(data.projects ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setListError(
            e instanceof Error ? e.message : "Failed to load project map",
          );
          setMapProjects([]);
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runBackfill = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        dry_run: dryRun,
        force_gemini: forceGemini,
        use_positional_when_counts_match: usePositional,
      };
      if (projectId.trim()) {
        body.project_id = projectId.trim();
      }
      const res = await fetch("/api/seed/backfill-photo-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as PhotoLabelsBackfillResponse;
      if (!res.ok) {
        setResult({
          success: false,
          error: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Backfill photo labels from past reports
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Parses the{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            SUBJECT PHOTOS
          </span>{" "}
          section of each markdown file in{" "}
          <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
            docs/past-reports/
          </code>
          , then updates{" "}
          <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
            photo_analyses.label
          </code>{" "}
          to match published captions. When label count equals included photo
          count, applies by sort order (fast). Otherwise uses Gemini + Drive to
          match each image to the report label list. Uses{" "}
          <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-900">
            projects_rows.json
          </code>{" "}
          for project IDs unless you pick a single project below.
        </p>
      </div>

      <p className="mb-3 text-xs text-amber-800 dark:text-amber-200/90">
        Requires{" "}
        <code className="rounded bg-amber-100 px-1 text-[10px] dark:bg-amber-950/80">
          GOOGLE_GEMINI_API_KEY
        </code>{" "}
        and a signed-in Google session with Drive access (same as reference photo
        analysis).
      </p>

      {listLoading ? (
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          Loading project map…
        </p>
      ) : listError ? (
        <div className="mb-3 space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300">{listError}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ensure <code className="text-xs">docs/past-reports/projects_rows.json</code>{" "}
            exists locally.
          </p>
        </div>
      ) : (
        <label className="mb-3 block text-sm text-gray-700 dark:text-gray-300">
          <span className="mb-1 block font-medium">Scope</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={isRunning}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">
              All projects in projects_rows.json ({mapProjects.length})
            </option>
            {mapProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mb-4 space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={usePositional}
            onChange={(e) => setUsePositional(e.target.checked)}
            disabled={isRunning}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Use positional assignment when label count matches photo count (skip
          Gemini for that project)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={forceGemini}
            onChange={(e) => setForceGemini(e.target.checked)}
            disabled={isRunning}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Force Gemini for every photo (even when counts match)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            disabled={isRunning}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Dry run (no DB writes; skips Gemini calls when counts do not match)
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runBackfill()}
          disabled={isRunning || listLoading || !!listError}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-gray-600"
        >
          {isRunning ? "Running…" : "Run backfill"}
        </button>
        <button
          type="button"
          onClick={() => void signIn("/project/seed")}
          disabled={isRunning}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
        >
          Sign in with Google
        </button>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-md border p-3 text-sm ${
            result.error || result.success === false
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          }`}
        >
          {result.error && <p className="font-medium">Error: {result.error}</p>}
          {result.success !== false && !result.error && (
            <>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {result.dry_run ? "Dry run complete" : "Backfill complete"}
              </p>
              {result.results && result.results.length > 0 && (
                <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs text-gray-800 dark:text-gray-200">
                  {result.results.map((r) => (
                    <li
                      key={r.project_id}
                      className="rounded-md border border-gray-200 bg-white/80 p-2 dark:border-gray-700 dark:bg-gray-900/60"
                    >
                      <span className="font-medium">{r.project_name}</span>
                      {r.md_file ? (
                        <span className="text-gray-500 dark:text-gray-400">
                          {" "}
                          · {r.md_file}
                        </span>
                      ) : null}
                      <br />
                      <span className="text-gray-600 dark:text-gray-400">
                        labels {r.label_count} · photos {r.photo_count} · mode{" "}
                        <code className="text-[10px]">{r.mode}</code> · updated{" "}
                        {r.updated}
                      </span>
                      {r.errors && r.errors.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-red-700 dark:text-red-300">
                          {r.errors.slice(0, 8).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                          {r.errors.length > 8 && (
                            <li>… and {r.errors.length - 8} more</li>
                          )}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">
                  Raw JSON
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-gray-900 p-3 text-[10px] text-gray-100">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SeedPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Seed / Import Tools
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          One-time import operations. These are safe to re-run — they skip if
          data already exists.
        </p>
      </div>

      <div className="space-y-4">
        <SeedButton
          label="Import Knowledge Base"
          description="Parse the AI Appraiser Knowledge Base CSV and insert into the knowledge_base table with embeddings. Skips if rows already exist."
          endpoint="/api/seed/knowledge-base"
        />

        <SeedButton
          label="Backfill Prior Reports"
          description="Extract sections from the 11 prior report PDFs in docs/prior-reports/ using Gemini, insert into report_sections with embeddings. Skips if backfill data already exists."
          endpoint="/api/seed/backfill-reports"
        />

        <DiscussionBackfillPanel />

        <NeighborhoodBackfillPanel />

        <ReportDueDateBackfillPanel />

        <CompBackfillPanel />

        <ImportLegacyLocalStoragePanel />

        <ForceImportPanel />

        <PatternsPanel />

        <PhotoBackfillPanel />

        <PhotoLabelsFromReportsPanel />
      </div>
    </div>
  );
}

