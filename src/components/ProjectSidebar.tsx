"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";
import { ProfileMenu } from "~/components/ProfileMenu";

interface ProjectSidebarProps {
  projectId: string;
}

interface NavItem {
  label: string;
  href: string;
}

interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

export function ProjectSidebar({ projectId }: ProjectSidebarProps) {
  const pathname = usePathname();
  const { project, projectName } = useProject(projectId);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const p = `/project/${projectId}`;

  const isActive = (path: string) => {
    if (path === p) return pathname === path;
    return pathname?.startsWith(path) ?? false;
  };

  const isActiveExact = (path: string, excludes?: string[]) => {
    if (!pathname?.startsWith(path)) return false;
    if (excludes) {
      return !excludes.some((e) => pathname.startsWith(e));
    }
    return true;
  };

  const subjectPhotoHref = project?.projectFolderId
    ? `${p}/subject/photos?folderId=${project.subjectPhotosFolderId ?? ""}&projectFolderId=${project.projectFolderId}`
    : `${p}/subject/photos`;

  const navSections: NavSection[] = [
    {
      key: "subject",
      label: "Subject",
      items: [
        { label: "Overview", href: `${p}/subject/overview` },
        { label: "Improvements", href: `${p}/subject/improvements` },
        { label: "Location Map", href: `${p}/subject/location-map` },
        { label: "Photos", href: subjectPhotoHref },
      ],
    },
    {
      key: "neighborhood",
      label: "Neighborhood",
      items: [
        { label: "Map & Analysis", href: `${p}/neighborhood` },
      ],
    },
    {
      key: "landSales",
      label: "Land Sales",
      items: [
        { label: "Comps", href: `${p}/land-sales/comparables` },
        { label: "Map", href: `${p}/land-sales/comparables-map` },
      ],
    },
    {
      key: "sales",
      label: "Sales",
      items: [
        { label: "Comps", href: `${p}/sales/comparables` },
        { label: "Map", href: `${p}/sales/comparables-map` },
        { label: "Comp UI", href: `${p}/sales/ui` },
      ],
    },
    {
      key: "rentals",
      label: "Rentals",
      items: [
        { label: "Comps", href: `${p}/rentals/comparables` },
        { label: "Map", href: `${p}/rentals/comparables-map` },
      ],
    },
    {
      key: "analysis",
      label: "Analysis",
      items: [
        { label: "Zoning", href: `${p}/analysis/zoning` },
        { label: "Ownership", href: `${p}/analysis/ownership` },
        { label: "Subject Site Summary", href: `${p}/analysis/subject-site-summary` },
        { label: "Highest and Best Use", href: `${p}/analysis/highest-best-use` },
      ],
    },
  ];

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navSections.map((s) => [s.key, true])),
  );

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside
      className={`relative z-[60] flex h-screen flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 dark:border-gray-800 dark:bg-gray-900 ${
        isCollapsed ? "w-12" : "w-64"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        {!isCollapsed && (
          <div className="overflow-hidden">
            <h2
              className="truncate text-lg font-bold text-gray-900 dark:text-gray-100"
              title={projectName ?? projectId}
            >
              {projectName ?? projectId}
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

      {/* Nav */}
      <div
        className={`flex-1 overflow-y-auto p-4 pt-0 ${isCollapsed ? "hidden" : ""}`}
      >
        <nav className="mt-4 space-y-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          {/* Dashboard */}
          <Link
            href={p}
            className={`block rounded-md px-3 py-2 transition ${
              pathname === p
                ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            Dashboard
          </Link>

          {/* Cover Page */}
          <Link
            href={`${p}/cover`}
            className={`block rounded-md px-3 py-2 transition ${
              isActive(`${p}/cover`)
                ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            Cover Page
          </Link>

          {/* Collapsible sections */}
          {navSections.map((section) => (
            <div key={section.key} className="pt-2">
              <button
                onClick={() => toggleSection(section.key)}
                className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold uppercase text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <span>{section.label}</span>
                <span>{expandedSections[section.key] ? "▼" : "▶"}</span>
              </button>

              {expandedSections[section.key] && (
                <div className="ml-2 space-y-1 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
                  {section.items.map((item) => {
                    const hrefBase = item.href.split("?")[0]!;
                    const active = isActiveExact(hrefBase);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-md px-3 py-2 transition ${
                          active
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Documents */}
          <div className="pt-2">
            <Link
              href={`${p}/documents`}
              className={`block rounded-md px-3 py-2 transition ${
                isActive(`${p}/documents`)
                  ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              Documents
            </Link>
          </div>
        </nav>
      </div>

      <ProfileMenu isCollapsed={isCollapsed} />
    </aside>
  );
}
