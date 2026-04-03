"use client";

import { useState } from "react";

interface SeedResult {
  message?: string;
  error?: string;
  imported?: number;
  total?: number;
  results?: { file: string; sectionsExtracted: number; error?: string }[];
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

export default function SeedPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Seed / Import Tools
        </h1>
        <p className="text-sm text-gray-500">
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

        <ForceImportPanel />

        <PatternsPanel />
      </div>
    </div>
  );
}

