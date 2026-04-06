"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import {
  Bars3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";
import { ProfileMenu } from "~/components/ProfileMenu";
import {
  DEFAULT_APPROACHES,
  getComparablesByType,
  type ProjectApproaches,
} from "~/utils/projectStore";

interface ProjectSidebarProps {
  projectId: string;
}

interface FolderStructure {
  costReportFolderId?: string;
  subjectSketchesFolderId?: string;
  subjectPhotosFolderId?: string;
  [key: string]: unknown;
}

export function ProjectSidebar({ projectId }: ProjectSidebarProps) {
  const pathname = usePathname();
  const { project, projectName } = useProject(projectId);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const p = `/project/${projectId}`;

  const isActive = (path: string) => {
    if (path === p) return pathname === path;
    return pathname?.startsWith(path) ?? false;
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  const raw = project as unknown as Record<string, unknown> | undefined;
  const folderStructure = (raw?.folderStructure ??
    raw?.folder_structure) as FolderStructure | undefined;
  const hasCostReport = !!folderStructure?.costReportFolderId;
  const hasSketches = !!folderStructure?.subjectSketchesFolderId;

  const rawPhotosId = folderStructure?.subjectPhotosFolderId;
  const photosFolderId = typeof rawPhotosId === "string" ? rawPhotosId : "";
  const subjectPhotoHref = project?.projectFolderId
    ? `${p}/subject/photos?folderId=${photosFolderId}&projectFolderId=${project.projectFolderId}`
    : `${p}/subject/photos`;

  const landComps = useMemo(
    () => (project ? getComparablesByType(project, "Land") : []),
    [project],
  );
  const salesComps = useMemo(
    () => (project ? getComparablesByType(project, "Sales") : []),
    [project],
  );
  const rentalComps = useMemo(
    () => (project ? getComparablesByType(project, "Rentals") : []),
    [project],
  );

  const approaches =
    (project as { approaches?: ProjectApproaches } | undefined)?.approaches ??
    DEFAULT_APPROACHES;

  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    subject: true,
    landSales: true,
    sales: true,
    rentals: true,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const linkClass = (href: string) =>
    `block rounded-md px-3 py-1.5 text-sm transition ${
      isActive(href)
        ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
    }`;

  const subLinkClass = (href: string) =>
    `block rounded px-3 py-1 text-xs transition truncate ${
      isActive(href)
        ? "text-blue-600 font-medium dark:text-blue-400"
        : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
    }`;

  const sectionHeaderClass =
    "flex w-full items-center justify-between px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200";

  function renderCompSublinks(
    comps: { id: string; number?: string; address: string }[],
    typeSlug: string,
  ) {
    if (comps.length === 0) return null;
    return (
      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-200 pl-2 dark:border-gray-800">
        {comps.map((c, i) => {
          const href = `${p}/${typeSlug}/comps/${c.id}`;
          const label = `#${c.number ?? i + 1} — ${c.address || "No address"}`;
          return (
            <Link key={c.id} href={href} className={subLinkClass(href)} title={label}>
              {label}
            </Link>
          );
        })}
      </div>
    );
  }

  const navContent = (
    <nav className="mt-4 space-y-1">
      <Link href={p} className={linkClass(p)}>Dashboard</Link>
      <Link href={`${p}/cover`} className={linkClass(`${p}/cover`)}>Cover Page</Link>
      <Link href={`${p}/neighborhood`} className={linkClass(`${p}/neighborhood`)}>Neighborhood</Link>

      {/* SUBJECT */}
      <div className="pt-3">
        <button onClick={() => toggleSection("subject")} className={sectionHeaderClass}>
          <span>Subject</span>
          <span className="text-[10px]">{expandedSections.subject ? "▼" : "▶"}</span>
        </button>
        {expandedSections.subject && (
          <div className="ml-2 space-y-0.5 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
            <Link href={`${p}/subject/overview`} className={linkClass(`${p}/subject/overview`)}>Overview</Link>
            <Link href={`${p}/subject/improvements`} className={linkClass(`${p}/subject/improvements`)}>Improvements</Link>
            <Link href={`${p}/subject/location-map`} className={linkClass(`${p}/subject/location-map`)}>Location Map</Link>
            <Link href={subjectPhotoHref} className={linkClass(`${p}/subject/photos`)}>Photos</Link>
            <Link href={`${p}/subject/flood-map`} className={linkClass(`${p}/subject/flood-map`)}>Flood Map</Link>
            {hasSketches && (
              <Link href={`${p}/subject/sketches`} className={linkClass(`${p}/subject/sketches`)}>Building Sketches</Link>
            )}
            {hasCostReport && approaches.cost && (
              <Link href={`${p}/subject/cost-report`} className={linkClass(`${p}/subject/cost-report`)}>Cost Report</Link>
            )}
            <div className="my-2 border-t border-gray-100 dark:border-gray-800" />
            <Link href={`${p}/analysis/zoning`} className={linkClass(`${p}/analysis/zoning`)}>Zoning</Link>
            <Link href={`${p}/analysis/ownership`} className={linkClass(`${p}/analysis/ownership`)}>Ownership</Link>
            <Link href={`${p}/analysis/subject-site-summary`} className={linkClass(`${p}/analysis/subject-site-summary`)}>Subject Site Summary</Link>
            <Link href={`${p}/analysis/highest-best-use`} className={linkClass(`${p}/analysis/highest-best-use`)}>Highest and Best Use</Link>
          </div>
        )}
      </div>

      {/* LAND SALES */}
      {approaches.salesComparison.land && (
        <div className="pt-3">
          <button onClick={() => toggleSection("landSales")} className={sectionHeaderClass}>
            <span>Land Sales</span>
            <span className="text-[10px]">{expandedSections.landSales ? "▼" : "▶"}</span>
          </button>
          {expandedSections.landSales && (
            <div className="ml-2 space-y-0.5 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
              <Link href={`${p}/land-sales/comparables`} className={linkClass(`${p}/land-sales/comparables`)}>Comps</Link>
              {renderCompSublinks(landComps, "land-sales")}
              <Link href={`${p}/land-sales/comparables-map`} className={linkClass(`${p}/land-sales/comparables-map`)}>Map</Link>
              <Link href={`${p}/land-sales/summary`} className={linkClass(`${p}/land-sales/summary`)}>Summary</Link>
              <Link href={`${p}/land-sales/adjustments`} className={linkClass(`${p}/land-sales/adjustments`)}>Adjustments</Link>
              <Link href={`${p}/land-sales/discussion`} className={linkClass(`${p}/land-sales/discussion`)}>Discussion</Link>
              <Link href={`${p}/land-sales/ui`} className={linkClass(`${p}/land-sales/ui`)}>Comp UI</Link>
            </div>
          )}
        </div>
      )}

      {/* SALES */}
      {approaches.salesComparison.sales && (
        <div className="pt-3">
          <button onClick={() => toggleSection("sales")} className={sectionHeaderClass}>
            <span>Sales</span>
            <span className="text-[10px]">{expandedSections.sales ? "▼" : "▶"}</span>
          </button>
          {expandedSections.sales && (
            <div className="ml-2 space-y-0.5 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
              <Link href={`${p}/sales/comparables`} className={linkClass(`${p}/sales/comparables`)}>Comps</Link>
              {renderCompSublinks(salesComps, "sales")}
              <Link href={`${p}/sales/comparables-map`} className={linkClass(`${p}/sales/comparables-map`)}>Map</Link>
              <Link href={`${p}/sales/summary`} className={linkClass(`${p}/sales/summary`)}>Summary</Link>
              <Link href={`${p}/sales/adjustments`} className={linkClass(`${p}/sales/adjustments`)}>Adjustments</Link>
              <Link href={`${p}/sales/discussion`} className={linkClass(`${p}/sales/discussion`)}>Discussion</Link>
              <Link href={`${p}/sales/ui`} className={linkClass(`${p}/sales/ui`)}>Comp UI</Link>
            </div>
          )}
        </div>
      )}

      {/* RENTALS */}
      {approaches.income && (
        <div className="pt-3">
          <button onClick={() => toggleSection("rentals")} className={sectionHeaderClass}>
            <span>Rentals</span>
            <span className="text-[10px]">{expandedSections.rentals ? "▼" : "▶"}</span>
          </button>
          {expandedSections.rentals && (
            <div className="ml-2 space-y-0.5 border-l-2 border-gray-100 pl-2 dark:border-gray-800">
              <Link href={`${p}/rentals/comparables`} className={linkClass(`${p}/rentals/comparables`)}>Comps</Link>
              {renderCompSublinks(rentalComps, "rentals")}
              <Link href={`${p}/rentals/comparables-map`} className={linkClass(`${p}/rentals/comparables-map`)}>Map</Link>
              <Link href={`${p}/rentals/summary`} className={linkClass(`${p}/rentals/summary`)}>Summary</Link>
              <Link href={`${p}/rentals/ui`} className={linkClass(`${p}/rentals/ui`)}>Comp UI</Link>
            </div>
          )}
        </div>
      )}

      {/* Documents */}
      <div className="pt-3">
        <Link href={`${p}/documents`} className={linkClass(`${p}/documents`)}>
          Documents
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      {/* ── Mobile: sticky top bar + slide-in drawer overlay ── */}
      <div className="md:hidden">
        {/* Sticky header bar */}
        <div className="fixed top-0 left-0 right-0 z-[60] flex h-14 items-center gap-3 border-b border-gray-200 bg-white/95 px-4 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/95">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Open navigation menu"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">
              {projectName ?? projectId}
            </p>
            <Link
              href="/projects"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              ← All Projects
            </Link>
          </div>

          <ProfileMenu isCollapsed variant="header" />
        </div>

        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-[65] bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
            isMobileOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />

        {/* Slide-in drawer */}
        <aside
          className={`fixed top-0 bottom-0 left-0 z-[70] flex w-72 flex-col border-r border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 ${
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Navigation drawer"
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-gray-800">
            <div className="min-w-0 flex-1 overflow-hidden">
              <h2
                className="truncate text-base font-bold text-gray-900 dark:text-gray-100"
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
            <button
              onClick={() => setIsMobileOpen(false)}
              className="ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              aria-label="Close navigation menu"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0">
            {navContent}
          </div>

          <ProfileMenu isCollapsed={false} />
        </aside>
      </div>

      {/* ── Desktop: traditional collapsible sidebar ── */}
      <aside
        className={`relative z-[60] hidden h-screen flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 dark:border-gray-800 dark:bg-gray-900 md:flex ${
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

        <div className={`flex-1 overflow-y-auto p-4 pt-0 ${isCollapsed ? "hidden" : ""}`}>
          {navContent}
        </div>

        <ProfileMenu isCollapsed={isCollapsed} />
      </aside>
    </>
  );
}
