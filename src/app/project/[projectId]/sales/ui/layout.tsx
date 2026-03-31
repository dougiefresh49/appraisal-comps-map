"use client";

import React, { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useProject } from "~/hooks/useProject";

interface SalesUILayoutProps {
  children: React.ReactNode;
  params: Promise<{
    projectId: string;
  }>;
}

export default function SalesUILayout({
  children,
  params,
}: SalesUILayoutProps) {
  const { projectId } = use(params);
  const { project, isLoading } = useProject(projectId);
  const searchParams = useSearchParams();
  const currentCompId = searchParams.get("compId");

  if (isLoading || !project) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-gray-500 dark:text-gray-400">
          Loading sales comparables...
        </div>
      </div>
    );
  }

  const salesComparables = project.comparables.filter(c => c.type === "Sales");

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-950">
      {/* Sub-sidebar for Sales Comparables */}
      <aside className="w-64 overflow-y-auto border-r border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Sales UI
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Select a comparable to view details.
          </p>
        </div>
        <nav className="space-y-1">
          {salesComparables.map((comp, index) => {
            const isActive = currentCompId === comp.id || (!currentCompId && index === 0);
            return (
              <Link
                key={comp.id}
                href={`/project/${projectId}/sales/ui?compId=${comp.id}`}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                Comparable {index + 1}
                {comp.address && (
                    <span className="block truncate text-xs font-normal text-gray-500 dark:text-gray-500">
                        {comp.address}
                    </span>
                )}
              </Link>
            );
          })}
          {salesComparables.length === 0 && (
             <div className="text-sm italic text-gray-500 dark:text-gray-400">
               No sales comparables found.
             </div>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
