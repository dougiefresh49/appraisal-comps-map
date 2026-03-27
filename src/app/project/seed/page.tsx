"use client";

import { useState } from "react";

interface SeedResult {
  message?: string;
  error?: string;
  imported?: number;
  total?: number;
  results?: { file: string; sectionsExtracted: number; error?: string }[];
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
      </div>
    </div>
  );
}
