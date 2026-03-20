"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useProject } from "~/hooks/useProject";

import { useTheme } from "~/components/ThemeProvider";

interface ProjectSidebarProps {
  projectId: string;
}

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

export function ProjectSidebar({ projectId }: ProjectSidebarProps) {
  const pathname = usePathname();
  const decodedProjectId = decodeURIComponent(projectId);
  const { project } = useProject(projectId);
  const { theme, toggleTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Helper to check if a path is active
  const isActive = (path: string) => {
    // Exact match or sub-path match for reports
    if (path === `/project/${projectId}`) {
      return pathname === path;
    }
    return pathname?.startsWith(path);
  };

  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    subject: true,
    landSales: true,
    sales: true,
    rentals: true,
    parser: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <aside 
      className={`relative z-[60] flex h-screen flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 dark:border-gray-800 dark:bg-gray-900 ${
        isCollapsed ? "w-12" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between p-4 pb-2">
        {!isCollapsed && (
          <div className="overflow-hidden">
             <h2
                className="truncate text-lg font-bold text-gray-900 dark:text-gray-100"
                title={decodedProjectId}
              >
                {decodedProjectId}
              </h2>
              <Link
                href="/projects"
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                ← All Projects
              </Link>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800 ${isCollapsed ? "mx-auto" : ""}`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
          )}
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 pt-0 ${isCollapsed ? "hidden" : ""}`}>
        <nav className="mt-4 space-y-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Link
            href={`/project/${projectId}`}
            className={`block rounded-md px-3 py-2 transition ${
              pathname === `/project/${projectId}`
                ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            Dashboard
          </Link>

          <Link
            href={`/project/${projectId}/cover`}
            className={`block rounded-md px-3 py-2 transition ${
              isActive(`/project/${projectId}/cover`)
                ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            Cover Page
          </Link>

          <Link
            href={`/project/${projectId}/neighborhood-map`}
            className={`block rounded-md px-3 py-2 transition ${
              isActive(`/project/${projectId}/neighborhood-map`)
                ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            Neighborhood Map
          </Link>

          <Link
            href={`/project/${projectId}/reports`}
            className={`block rounded-md px-3 py-2 transition ${
              isActive(`/project/${projectId}/reports`)
                ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            Reports
          </Link>

          {/* Subject Section */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection("subject")}
              className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span>Subject</span>
              <span>{expandedSections.subject ? "▼" : "▶"}</span>
            </button>
            {expandedSections.subject && (
              <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
                <Link
                  href={`/project/${projectId}/subject/location-map`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/subject/location-map`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Location Map
                </Link>
                <Link
                  href={
                    project?.projectFolderId
                      ? `/project/${projectId}/subject/photos?folderId=${project?.subjectPhotosFolderId}&projectFolderId=${project?.projectFolderId}`
                      : `/project/${projectId}/subject/photos`
                  }
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/subject/photos`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Photos
                </Link>
              </div>
            )}
          </div>

          {/* Land Sales Section */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection("landSales")}
              className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span>Land Sales</span>
              <span>{expandedSections.landSales ? "▼" : "▶"}</span>
            </button>
            {expandedSections.landSales && (
              <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
                <Link
                  href={`/project/${projectId}/land-sales/comparables`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/land-sales/comparables`) &&
                    !isActive(`/project/${projectId}/land-sales/comparables-map`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Comps
                </Link>
                <Link
                  href={`/project/${projectId}/land-sales/comparables-map`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/land-sales/comparables-map`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Map
                </Link>
                {/* Future: Comps list or details could go here */}
              </div>
            )}
          </div>

          {/* Sales Section */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection("sales")}
              className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span>Sales</span>
              <span>{expandedSections.sales ? "▼" : "▶"}</span>
            </button>
            {expandedSections.sales && (
              <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
                <Link
                  href={`/project/${projectId}/sales/comparables`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/sales/comparables`) &&
                    !isActive(`/project/${projectId}/sales/comparables-map`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Comps
                </Link>
                <Link
                  href={`/project/${projectId}/sales/comparables-map`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/sales/comparables-map`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Map
                </Link>
                <Link
                  href={`/project/${projectId}/sales/ui`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/sales/ui`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  UI
                </Link>
              </div>
            )}
          </div>

          {/* Rentals Section */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection("rentals")}
              className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span>Rentals</span>
              <span>{expandedSections.rentals ? "▼" : "▶"}</span>
            </button>
            {expandedSections.rentals && (
              <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
                <Link
                  href={`/project/${projectId}/rentals/comparables`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/rentals/comparables`) &&
                    !isActive(`/project/${projectId}/rentals/comparables-map`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Comps
                </Link>
                <Link
                  href={`/project/${projectId}/rentals/comparables-map`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/rentals/comparables-map`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Map
                </Link>
              </div>
            )}
          </div>

          {/* Parser Section */}
          <div className="pt-2">
            <button
              onClick={() => toggleSection("parser")}
              className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span>Parser</span>
              <span>{expandedSections.parser ? "▼" : "▶"}</span>
            </button>
            {expandedSections.parser && (
              <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
                <Link
                  href={`/project/${projectId}/parser/land`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/parser/land`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Land
                </Link>
                <Link
                  href={`/project/${projectId}/parser/sales`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/parser/sales`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Sales
                </Link>
                <Link
                  href={`/project/${projectId}/parser/rentals`}
                  className={`block rounded-md px-3 py-2 transition ${
                    isActive(`/project/${projectId}/parser/rentals`)
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Rentals
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className={`border-t border-gray-200 p-4 dark:border-gray-800 ${isCollapsed ? "hidden" : ""}`}>
        <button
          onClick={toggleTheme}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>
      </div>
    </aside>
  );
}
