"use client";

import {
  ChevronDownIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { startOfDay } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppSiteHeader } from "~/components/AppSiteHeader";
import { CreateProjectCard } from "~/components/CreateProjectCard";
import { ProjectCard } from "~/components/ProjectCard";
import {
  archiveProject,
  deleteProject,
  fetchProjectsList,
  type ProjectListItem,
} from "~/lib/supabase-queries";
import { parseEngagementDateToDate } from "~/utils/parse-engagement-date";

function isReportDueInPast(reportDueDate: string | undefined): boolean {
  if (!reportDueDate?.trim()) return false;
  const parsed = parseEngagementDateToDate(reportDueDate);
  if (!parsed) return false;
  const today = startOfDay(new Date());
  return startOfDay(parsed).getTime() < today.getTime();
}

function projectSearchHaystack(p: ProjectListItem): string {
  return [
    p.name,
    p.clientCompany,
    p.propertyType,
    p.address,
    p.city,
  ]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function matchesSearch(p: ProjectListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = projectSearchHaystack(p);
  return tokens.every((t) => hay.includes(t));
}

function sortedUnique(values: (string | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = v?.trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Read a single query param from URLSearchParams, returning "" when absent. */
function qp(params: URLSearchParams, key: string): string {
  return params.get(key) ?? "";
}

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialise all filter state from URL on first render.
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(() => qp(searchParams, "q"));
  const [filterCity, setFilterCity] = useState(() => qp(searchParams, "city"));
  const [filterType, setFilterType] = useState(() => qp(searchParams, "type"));
  const [showPastDue, setShowPastDue] = useState(
    () => searchParams.get("completed") === "1",
  );
  const [showReferenceProjects, setShowReferenceProjects] = useState(
    () => searchParams.get("ref") === "1",
  );
  const [listOptionsOpen, setListOptionsOpen] = useState(false);
  const listOptionsRef = useRef<HTMLDivElement | null>(null);

  // Sync filter state → URL query params (replace so back-button still works).
  useEffect(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("q", search.trim());
    if (filterCity) p.set("city", filterCity);
    if (filterType) p.set("type", filterType);
    if (showPastDue) p.set("completed", "1");
    if (showReferenceProjects) p.set("ref", "1");
    const qs = p.toString();
    router.replace(qs ? `/projects?${qs}` : "/projects", { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterCity, filterType, showPastDue, showReferenceProjects]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await fetchProjectsList({
          includeReferenceProjects: showReferenceProjects,
        });
        if (!cancelled) setProjects(list);
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [showReferenceProjects]);

  useEffect(() => {
    if (!listOptionsOpen) return;
    function handlePointerDown(e: MouseEvent) {
      const el = listOptionsRef.current;
      if (!el?.contains(e.target as Node)) setListOptionsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [listOptionsOpen]);

  const afterPastDueFilter = useMemo(() => {
    const filtered = showPastDue
      ? projects
      : projects.filter((p) => !isReportDueInPast(p.reportDueDate));

    return [...filtered].sort((a, b) => {
      const da = a.effectiveDate
        ? parseEngagementDateToDate(a.effectiveDate)
        : null;
      const db = b.effectiveDate
        ? parseEngagementDateToDate(b.effectiveDate)
        : null;
      if (da && db) return db.getTime() - da.getTime();
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
  }, [projects, showPastDue]);

  const { cityOptions, typeOptions } = useMemo(() => {
    return {
      cityOptions: sortedUnique(afterPastDueFilter.map((p) => p.city)),
      typeOptions: sortedUnique(
        afterPastDueFilter.map((p) => p.propertyType),
      ),
    };
  }, [afterPastDueFilter]);

  const listOptionsActiveCount =
    (showPastDue ? 1 : 0) + (showReferenceProjects ? 1 : 0);

  const visibleProjects = useMemo(() => {
    return afterPastDueFilter.filter((p) => {
      if (filterCity && (p.city?.trim() ?? "") !== filterCity) return false;
      if (filterType && (p.propertyType?.trim() ?? "") !== filterType)
        return false;
      if (!matchesSearch(p, search)) return false;
      return true;
    });
  }, [afterPastDueFilter, filterCity, filterType, search]);

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      console.error("Failed to delete project", err);
    }
  };

  const handleArchiveProject = async (projectId: string) => {
    try {
      await archiveProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      console.error("Failed to archive project", err);
    }
  };

  const selectClass =
    "rounded-lg border border-gray-300 bg-white py-2 pl-2 pr-8 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#030712]">
        <AppSiteHeader />
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
          <p className="text-sm font-medium text-slate-500 dark:text-cyan-200/70">
            Loading projects…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#030712]">
      <AppSiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-cyan-50">
            Projects
          </h1>
          <p className="mt-2 text-slate-600 dark:text-cyan-100/65">
            Select a project to view details or start a new one.
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, client, type, address…"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div
              className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"
              title="Filter projects"
            >
              <FunnelIcon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="sr-only">Filters</span>
            </div>
            <select
              className={selectClass}
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              aria-label="Filter by location (city)"
            >
              <option value="">All locations</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Filter by property type"
            >
              <option value="">All types</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <div className="relative" ref={listOptionsRef}>
              <button
                type="button"
                onClick={() => setListOptionsOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700/50"
                aria-expanded={listOptionsOpen}
                aria-haspopup="true"
              >
                List options
                {listOptionsActiveCount > 0 ? (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-blue-500">
                    {listOptionsActiveCount}
                  </span>
                ) : null}
                <ChevronDownIcon
                  className={`h-4 w-4 shrink-0 text-gray-500 transition dark:text-gray-400 ${listOptionsOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {listOptionsOpen ? (
                <div
                  className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-600 dark:bg-gray-900"
                  role="group"
                  aria-label="List options"
                >
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-xs text-slate-700 hover:bg-gray-50 dark:text-cyan-100/90 dark:hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={showPastDue}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setShowPastDue(next);
                        if (next) {
                          setSearch("");
                          setFilterCity("");
                          setFilterType("");
                        }
                      }}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                    />
                    <span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        Show completed
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                        Include jobs whose report due date is in the past.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-xs text-slate-700 hover:bg-gray-50 dark:text-cyan-100/90 dark:hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={showReferenceProjects}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setShowReferenceProjects(next);
                        if (next) {
                          setSearch("");
                          setFilterCity("");
                          setFilterType("");
                        }
                      }}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                    />
                    <span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        Show reference projects
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                        Load reference library and other is_reference rows.
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {projects.length > 0 && visibleProjects.length === 0 ? (
          <p className="mb-6 rounded-lg border border-dashed border-gray-300 bg-white/50 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-400">
            No projects match your filters.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div>
            <CreateProjectCard />
          </div>

          {visibleProjects.map((item) => (
            <div key={item.id}>
              <ProjectCard
                projectId={item.id}
                projectName={item.name}
                address={item.address}
                effectiveDate={item.effectiveDate}
                reportDate={item.reportDueDate}
                clientName={item.clientCompany}
                propertyType={item.propertyType}
                onArchive={handleArchiveProject}
                onDelete={handleDeleteProject}
              />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
