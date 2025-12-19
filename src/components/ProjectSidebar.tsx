"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useProject } from "~/hooks/useProject";

interface ProjectSidebarProps {
  projectId: string;
}

export function ProjectSidebar({ projectId }: ProjectSidebarProps) {
  const pathname = usePathname();
  const decodedProjectId = decodeURIComponent(projectId);
  const { project } = useProject(projectId);

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
    <aside className="flex h-screen w-64 flex-col overflow-y-auto border-r border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-6">
        <h2
          className="truncate text-lg font-bold text-gray-900"
          title={decodedProjectId}
        >
          {decodedProjectId}
        </h2>
        <Link
          href="/projects"
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← All Projects
        </Link>
      </div>

      <nav className="space-y-1 text-sm font-medium text-gray-700">
        <Link
          href={`/project/${projectId}`}
          className={`block rounded-md px-3 py-2 transition ${
            pathname === `/project/${projectId}`
              ? "bg-blue-50 font-semibold text-blue-700"
              : "hover:bg-gray-100"
          }`}
        >
          Dashboard
        </Link>

        <Link
          href={`/project/${projectId}/cover`}
          className={`block rounded-md px-3 py-2 transition ${
            isActive(`/project/${projectId}/cover`)
              ? "bg-blue-50 font-semibold text-blue-700"
              : "hover:bg-gray-100"
          }`}
        >
          Cover Page
        </Link>

        <Link
          href={`/project/${projectId}/neighborhood-map`}
          className={`block rounded-md px-3 py-2 transition ${
            isActive(`/project/${projectId}/neighborhood-map`)
              ? "bg-blue-50 font-semibold text-blue-700"
              : "hover:bg-gray-100"
          }`}
        >
          Neighborhood Map
        </Link>

        <Link
          href={`/project/${projectId}/reports`}
          className={`block rounded-md px-3 py-2 transition ${
            isActive(`/project/${projectId}/reports`)
              ? "bg-blue-50 font-semibold text-blue-700"
              : "hover:bg-gray-100"
          }`}
        >
          Reports
        </Link>

        {/* Subject Section */}
        <div className="pt-2">
          <button
            onClick={() => toggleSection("subject")}
            className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700"
          >
            <span>Subject</span>
            <span>{expandedSections.subject ? "▼" : "▶"}</span>
          </button>
          {expandedSections.subject && (
            <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2">
              <Link
                href={`/project/${projectId}/subject/location-map`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/subject/location-map`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
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
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
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
            className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700"
          >
            <span>Land Sales</span>
            <span>{expandedSections.landSales ? "▼" : "▶"}</span>
          </button>
          {expandedSections.landSales && (
            <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2">
              <Link
                href={`/project/${projectId}/land-sales/comparables`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/land-sales/comparables`) &&
                  !isActive(`/project/${projectId}/land-sales/comparables-map`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
                }`}
              >
                Comps
              </Link>
              <Link
                href={`/project/${projectId}/land-sales/comparables-map`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/land-sales/comparables-map`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
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
            className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700"
          >
            <span>Sales</span>
            <span>{expandedSections.sales ? "▼" : "▶"}</span>
          </button>
          {expandedSections.sales && (
            <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2">
              <Link
                href={`/project/${projectId}/sales/comparables`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/sales/comparables`) &&
                  !isActive(`/project/${projectId}/sales/comparables-map`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
                }`}
              >
                Comps
              </Link>
              <Link
                href={`/project/${projectId}/sales/comparables-map`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/sales/comparables-map`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
                }`}
              >
                Map
              </Link>
              <Link
                href={`/project/${projectId}/sales/ui`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/sales/ui`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
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
            className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700"
          >
            <span>Rentals</span>
            <span>{expandedSections.rentals ? "▼" : "▶"}</span>
          </button>
          {expandedSections.rentals && (
            <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2">
              <Link
                href={`/project/${projectId}/rentals/comparables`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/rentals/comparables`) &&
                  !isActive(`/project/${projectId}/rentals/comparables-map`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
                }`}
              >
                Comps
              </Link>
              <Link
                href={`/project/${projectId}/rentals/comparables-map`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/rentals/comparables-map`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
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
            className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700"
          >
            <span>Parser</span>
            <span>{expandedSections.parser ? "▼" : "▶"}</span>
          </button>
          {expandedSections.parser && (
            <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2">
              <Link
                href={`/project/${projectId}/parser/land`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/parser/land`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
                }`}
              >
                Land
              </Link>
              <Link
                href={`/project/${projectId}/parser/sales`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/parser/sales`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
                }`}
              >
                Sales
              </Link>
              <Link
                href={`/project/${projectId}/parser/rentals`}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive(`/project/${projectId}/parser/rentals`)
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100"
                }`}
              >
                Rentals
              </Link>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
