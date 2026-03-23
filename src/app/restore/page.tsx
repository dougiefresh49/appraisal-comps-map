"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROJECTS_STORAGE_KEY,
  normalizeProjectsMap,
  type ProjectsMap,
} from "~/utils/projectStore";
import { insertProject } from "~/lib/supabase-queries";
import { useAuth } from "~/hooks/useAuth";

interface MigrationResult {
  name: string;
  status: "success" | "error";
  message?: string;
  supabaseId?: string;
}

export default function SeedPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [results, setResults] = useState<MigrationResult[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [source, setSource] = useState<"localStorage" | "file">("localStorage");

  const migrateProjects = async (projectsMap: ProjectsMap) => {
    setIsMigrating(true);
    const migrationResults: MigrationResult[] = [];

    for (const [name, projectData] of Object.entries(projectsMap)) {
      try {
        const newId = await insertProject(name, projectData);
        migrationResults.push({
          name,
          status: "success",
          supabaseId: newId,
        });
      } catch (error) {
        migrationResults.push({
          name,
          status: "error",
          message:
            error instanceof Error ? error.message : "Unknown error",
        });
      }
      setResults([...migrationResults]);
    }

    setIsMigrating(false);
  };

  const handleMigrateFromLocalStorage = async () => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!stored) {
      setResults([
        {
          name: "(none)",
          status: "error",
          message: "No projects found in localStorage",
        },
      ]);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const normalized = normalizeProjectsMap(parsed);

      if (Object.keys(normalized).length === 0) {
        setResults([
          {
            name: "(none)",
            status: "error",
            message: "localStorage contains no valid projects",
          },
        ]);
        return;
      }

      await migrateProjects(normalized);
    } catch (error) {
      setResults([
        {
          name: "(parse error)",
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to parse localStorage data",
        },
      ]);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const normalized = normalizeProjectsMap(parsed);

      if (Object.keys(normalized).length === 0) {
        setResults([
          {
            name: "(none)",
            status: "error",
            message: "File contains no valid projects",
          },
        ]);
        return;
      }

      await migrateProjects(normalized);
    } catch (error) {
      setResults([
        {
          name: "(parse error)",
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to parse backup file",
        },
      ]);
    }
  };

  const handleClearLocalStorage = () => {
    if (typeof window === "undefined") return;
    if (
      window.confirm(
        "This will remove all project data from localStorage. This cannot be undone. Continue?",
      )
    ) {
      window.localStorage.removeItem(PROJECTS_STORAGE_KEY);
    }
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500">Please sign in to migrate data.</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
      <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">
          Seed Supabase from localStorage
        </h1>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Push your local project data into the Supabase database. This is a
          one-time operation. Each user should run this once from their
          browser.
        </p>

        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setSource("localStorage")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              source === "localStorage"
                ? "bg-blue-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            }`}
          >
            From localStorage
          </button>
          <button
            onClick={() => setSource("file")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              source === "file"
                ? "bg-blue-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            }`}
          >
            From JSON File
          </button>
        </div>

        {source === "localStorage" && (
          <button
            onClick={handleMigrateFromLocalStorage}
            disabled={isMigrating}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isMigrating ? "Migrating..." : "Migrate localStorage to Supabase"}
          </button>
        )}

        {source === "file" && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Backup JSON File
            </label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              disabled={isMigrating}
              className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-900 focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Results ({successCount} succeeded, {errorCount} failed)
            </h2>
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-md p-3 text-sm ${
                    r.status === "success"
                      ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                      : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                  }`}
                >
                  <span className="font-medium">{r.name}</span>
                  {r.status === "success" && (
                    <span className="ml-2 text-xs opacity-75">
                      ID: {r.supabaseId}
                    </span>
                  )}
                  {r.message && (
                    <div className="mt-1 text-xs">{r.message}</div>
                  )}
                </div>
              ))}
            </div>

            {successCount > 0 && errorCount === 0 && (
              <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                <button
                  onClick={() => router.push("/projects")}
                  className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
                >
                  Go to Projects
                </button>
                <button
                  onClick={handleClearLocalStorage}
                  className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Clear localStorage (optional)
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
          <a
            href="/projects"
            className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Back to Projects
          </a>
        </div>
      </div>
    </div>
  );
}
