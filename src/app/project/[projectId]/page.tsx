"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import {
  ArrowTopRightOnSquareIcon,
  ScaleIcon,
  BanknotesIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import {
  COMPARABLE_TYPES,
  getComparablesByType,
  getDistanceLabelFromCompsMap,
  DEFAULT_APPROACHES,
  normalizeProjectApproaches,
  type ComparableType,
  type Comparable,
  type ProjectData,
} from "~/utils/projectStore";
import { useProject } from "~/hooks/useProject";
import { useSubjectData } from "~/hooks/useSubjectData";

import { ToggleSwitch } from "~/components/ToggleField";

function sectionSlugForComparableType(type: ComparableType): string {
  if (type === "Land") return "land-sales";
  if (type === "Sales") return "sales";
  return "rentals";
}

function DashboardComparableSection({
  type,
  list,
  projectId,
  project,
}: {
  type: ComparableType;
  list: Comparable[];
  projectId: string;
  project: ProjectData;
}) {
  const sectionSlug = sectionSlugForComparableType(type);
  const openCompsLabel = `Open ${type} comparables`;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-2 dark:border-gray-800">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {type} Comparables ({list.length})
        </span>
        <Link
          href={`/project/${projectId}/${sectionSlug}/comparables`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          aria-label={openCompsLabel}
          title={openCompsLabel}
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No {type.toLowerCase()} comparables yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {list.map((comparable, index) => {
            const distanceLabel = getDistanceLabelFromCompsMap(
              project,
              comparable.id,
              type,
            );
            return (
            <li
              key={comparable.id}
              className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {type} #{index + 1}
                  </span>
                  {type === "Land" ? (
                    <Link
                      href={`/project/${projectId}/land-sales/comps/${comparable.id}/location-map`}
                      className="text-[10px] font-semibold uppercase tracking-wide text-green-700 underline-offset-2 hover:text-green-600 hover:underline dark:text-green-400 dark:hover:text-green-300"
                    >
                      Map
                    </Link>
                  ) : null}
                </div>
                <Link
                  href={`/project/${projectId}/${sectionSlug}/comps/${comparable.id}`}
                  className="inline-block text-sm font-medium text-gray-900 underline-offset-2 hover:text-blue-600 hover:underline dark:text-gray-100 dark:hover:text-blue-400"
                  title={`Open ${type} comp ${index + 1}`}
                  aria-label={`View details for ${comparable.address?.trim() ? comparable.address : `${type} comparable ${index + 1}`}`}
                >
                  {comparable.address || "No Address"}
                </Link>
                {comparable.addressForDisplay &&
                  comparable.addressForDisplay !== comparable.address && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Display: {comparable.addressForDisplay}
                    </p>
                  )}
              </div>
              <dl className="grid min-w-0 max-w-full shrink grid-cols-2 gap-x-4 gap-y-1 text-xs sm:gap-x-6 sm:text-right">
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    APN
                  </dt>
                  <dd className="font-mono text-[11px] leading-snug text-gray-800 dark:text-gray-200">
                    {comparable.apn && comparable.apn.length > 0 ? (
                      <span className="flex flex-col gap-1 sm:items-end">
                        {comparable.apn.map((apn, apnIdx) => (
                          <span
                            key={`${comparable.id}-apn-${apnIdx}`}
                            className="block max-w-full overflow-x-auto whitespace-nowrap sm:text-right"
                            title={apn}
                          >
                            {apn}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-600">—</span>
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Distance
                  </dt>
                  <dd className="text-gray-800 dark:text-gray-200">
                    {distanceLabel ?? (
                      <span className="text-gray-400 dark:text-gray-600">
                        —
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface ProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function ProjectDashboard({ params }: ProjectPageProps) {
  const { projectId } = use(params);
  const {
    project: selectedProject,
    updateProject,
    isLoading,
    projectExists,
    projectName,
  } = useProject(projectId);
  const { subjectData, isLoading: isSubjectLoading } = useSubjectData(projectId);
  const decodedProjectId = decodeURIComponent(projectId);
  const displayHeading = projectName?.trim()
    ? projectName
    : decodedProjectId;

  const subjectCore = useMemo(() => {
    if (!subjectData?.core || typeof subjectData.core !== "object") return null;
    return subjectData.core as Record<string, unknown>;
  }, [subjectData]);


  const comparablesByType = useMemo(() => {
    if (!selectedProject) {
      return COMPARABLE_TYPES.reduce<Record<ComparableType, Comparable[]>>(
        (acc, type) => {
          acc[type] = [];
          return acc;
        },
        {} as Record<ComparableType, Comparable[]>,
      );
    }
    return COMPARABLE_TYPES.reduce<Record<ComparableType, Comparable[]>>(
      (acc, type) => {
        acc[type] = getComparablesByType(selectedProject, type);
        return acc;
      },
      {} as Record<ComparableType, Comparable[]>,
    );
  }, [selectedProject]);

  /** Same flags as Report Approaches — controls which comp lists appear below. */
  const reportApproaches = useMemo(
    () => normalizeProjectApproaches(selectedProject?.approaches),
    [selectedProject?.approaches],
  );
  const showLandCompsSection = reportApproaches.salesComparison.land;
  const showSalesCompsSection = reportApproaches.salesComparison.sales;
  const showRentalsCompsSection = reportApproaches.income;
  const anyComparableSectionVisible =
    showLandCompsSection ||
    showSalesCompsSection ||
    showRentalsCompsSection;


  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading project...</div>
      </div>
    );
  }

  if (!projectExists || !selectedProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Project Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400">The project &quot;{decodedProjectId}&quot; does not exist.</p>
        <Link 
          href="/projects" 
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {displayHeading}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Report Overview
        </p>
      </div>

      <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Subject Information
              </h3>
              <Link
                href={`/project/${projectId}/subject/overview`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                aria-label="Open subject overview"
                title="Open subject overview"
              >
                <ArrowTopRightOnSquareIcon
                  className="h-4 w-4"
                  aria-hidden
                />
              </Link>
            </div>

            {subjectCore && Object.keys(subjectCore).length > 0 ? (
              <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
                {(
                  [
                    ["Address", subjectCore.Address],
                    ["Legal Description", subjectCore.Legal],
                    ["APN", subjectCore.APN],
                    ["City", subjectCore.City],
                    ["State", subjectCore.State],
                    ["County", subjectCore.County],
                    ["Zoning", subjectCore.Zoning],
                    ["Year Built", subjectCore["Year Built"]],
                    ["Land Size (AC)", subjectCore["Land Size (AC)"]],
                    ["Land Size (SF)", subjectCore["Land Size (SF)"] ?? (typeof subjectCore["Land Size (AC)"] === "number" ? subjectCore["Land Size (AC)"] * 43560 : null)],
                    ["Building Size (SF)", subjectCore["Building Size (SF)"]],
                    ["Condition", subjectCore.Condition],
                    ["Construction", subjectCore.Construction],
                    ["Surface", subjectCore.Surface],
                  ] as [string, unknown][]
                )
                  .filter(([, v]) => v != null && v !== "" && v !== 0)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
              </div>
            ) : !isSubjectLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No subject data yet.{" "}
                <Link
                  href={`/project/${projectId}/subject/overview`}
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open Subject Overview
                </Link>{" "}
                to add property details, or process subject documents.
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
              Project Details
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Client Company
                </label>
                <input
                  type="text"
                  value={selectedProject.clientCompany ?? ""}
                  onChange={(event) => {
                    updateProject((project) => ({
                      ...project,
                      clientCompany: event.target.value,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="Winkler County Hospital District"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Client Name
                </label>
                <input
                  type="text"
                  value={selectedProject.clientName ?? ""}
                  onChange={(event) => {
                    updateProject((project) => ({
                      ...project,
                      clientName: event.target.value,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="Lorenzo Serrano"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Property Type
                </label>
                <input
                  type="text"
                  value={selectedProject.propertyType ?? ""}
                  onChange={(event) => {
                    updateProject((project) => ({
                      ...project,
                      propertyType: event.target.value,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="Commercial Office Building"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Project Folder ID
                </label>
                <input
                  type="text"
                  value={selectedProject.projectFolderId ?? ""}
                  readOnly
                  className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Effective Date
                </label>
                <input
                  type="text"
                  value={selectedProject.effectiveDate ?? ""}
                  onChange={(event) => {
                    updateProject((project) => ({
                      ...project,
                      effectiveDate: event.target.value,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="As of / report effective date"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Report Due Date
                </label>
                <input
                  type="text"
                  value={selectedProject.reportDueDate ?? ""}
                  onChange={(event) => {
                    updateProject((project) => ({
                      ...project,
                      reportDueDate: event.target.value,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  placeholder="Delivery deadline"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Exposure Time
                </label>
                <input
                  type="text"
                  value={selectedProject.exposureTime ?? ""}
                  onChange={(event) => {
                    updateProject((project) => ({
                      ...project,
                      exposureTime: event.target.value,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Highest and Best Use
                </label>
                <input
                  type="text"
                  value={selectedProject.highestBestUse ?? ""}
                  onChange={(event) => {
                    updateProject((project) => ({
                      ...project,
                      highestBestUse: event.target.value,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Insurance Price / SF
                </label>
                <input
                  type="number"
                  step="any"
                  value={
                    selectedProject.insurancePricePerSf != null &&
                    !Number.isNaN(selectedProject.insurancePricePerSf)
                      ? String(selectedProject.insurancePricePerSf)
                      : ""
                  }
                  onChange={(event) => {
                    const raw = event.target.value;
                    updateProject((project) => ({
                      ...project,
                      insurancePricePerSf:
                        raw === ""
                          ? undefined
                          : Number(raw) === Number(raw)
                            ? Number(raw)
                            : project.insurancePricePerSf,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
                  Vacancy Rate
                </label>
                <input
                  type="number"
                  step="any"
                  value={
                    selectedProject.vacancyRate != null &&
                    !Number.isNaN(selectedProject.vacancyRate)
                      ? String(selectedProject.vacancyRate)
                      : ""
                  }
                  onChange={(event) => {
                    const raw = event.target.value;
                    updateProject((project) => ({
                      ...project,
                      vacancyRate:
                        raw === ""
                          ? undefined
                          : Number(raw) === Number(raw)
                            ? Number(raw)
                            : project.vacancyRate,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                />
              </div>
            </div>
          </section>

          {/* Report Approaches */}
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Report Approaches
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Control which valuation approaches and comp sections appear in the sidebar.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {/* Sales Comparison Card */}
              {(() => {
                const approaches = selectedProject.approaches ?? DEFAULT_APPROACHES;
                const landEnabled = approaches.salesComparison.land;
                const salesEnabled = approaches.salesComparison.sales;
                const anyEnabled = landEnabled || salesEnabled;
                return (
                  <div
                    className={`relative flex flex-col rounded-lg border-2 p-4 transition-colors ${
                      anyEnabled
                        ? "border-blue-500/40 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-950/20"
                        : "border-gray-200 bg-gray-50 dark:border-gray-700/60 dark:bg-gray-950/40"
                    }`}
                  >
                    <div className="mb-3 flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          anyEnabled
                            ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
                            : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
                        }`}
                      >
                        <ScaleIcon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${anyEnabled ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-500"}`}>
                          Sales Comparison
                        </p>
                        <p className="mt-0.5 text-[11px] leading-tight text-gray-500 dark:text-gray-500">
                          Compare against sold properties
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto space-y-2 border-t border-gray-200/60 pt-3 dark:border-gray-700/40">
                      <button
                        type="button"
                        onClick={() => {
                          updateProject((prev) => ({
                            ...prev,
                            approaches: {
                              ...(prev.approaches ?? DEFAULT_APPROACHES),
                              salesComparison: {
                                ...(prev.approaches ?? DEFAULT_APPROACHES).salesComparison,
                                land: !landEnabled,
                              },
                            },
                          }));
                        }}
                        aria-pressed={landEnabled}
                        className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          landEnabled
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700"
                        }`}
                      >
                        <span>Land Comps</span>
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${landEnabled ? "bg-blue-500 dark:bg-blue-400" : "bg-gray-300 dark:bg-gray-600"}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateProject((prev) => ({
                            ...prev,
                            approaches: {
                              ...(prev.approaches ?? DEFAULT_APPROACHES),
                              salesComparison: {
                                ...(prev.approaches ?? DEFAULT_APPROACHES).salesComparison,
                                sales: !salesEnabled,
                              },
                            },
                          }));
                        }}
                        aria-pressed={salesEnabled}
                        className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          salesEnabled
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700"
                        }`}
                      >
                        <span>Improved Sales</span>
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${salesEnabled ? "bg-blue-500 dark:bg-blue-400" : "bg-gray-300 dark:bg-gray-600"}`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Income Approach Card */}
              {(() => {
                const approaches = selectedProject.approaches ?? DEFAULT_APPROACHES;
                const enabled = approaches.income;
                return (
                  <div
                    className={`relative flex flex-col rounded-lg border-2 p-4 transition-colors ${
                      enabled
                        ? "border-emerald-500/40 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-950/20"
                        : "border-gray-200 bg-gray-50 dark:border-gray-700/60 dark:bg-gray-950/40"
                    }`}
                  >
                    <div className="mb-3 flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          enabled
                            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400"
                            : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
                        }`}
                      >
                        <BanknotesIcon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${enabled ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-500"}`}>
                          Income Approach
                        </p>
                        <p className="mt-0.5 text-[11px] leading-tight text-gray-500 dark:text-gray-500">
                          Rental income &amp; cap rate analysis
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto border-t border-gray-200/60 pt-3 dark:border-gray-700/40">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${enabled ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}>
                          {enabled ? "Enabled" : "Disabled"}
                        </span>
                        <ToggleSwitch
                          aria-label="Income approach enabled"
                          value={enabled}
                          onChange={(income) => {
                            updateProject((prev) => ({
                              ...prev,
                              approaches: {
                                ...(prev.approaches ?? DEFAULT_APPROACHES),
                                income,
                              },
                            }));
                          }}
                        />
                      </div>
                      {!enabled && (
                        <p className="mt-2 text-[11px] leading-tight text-gray-400 dark:text-gray-600">
                          Rentals &amp; income fields hidden from sidebar.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Cost Approach Card */}
              {(() => {
                const approaches = selectedProject.approaches ?? DEFAULT_APPROACHES;
                const enabled = approaches.cost;
                return (
                  <div
                    className={`relative flex flex-col rounded-lg border-2 p-4 transition-colors ${
                      enabled
                        ? "border-amber-500/40 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-950/20"
                        : "border-gray-200 bg-gray-50 dark:border-gray-700/60 dark:bg-gray-950/40"
                    }`}
                  >
                    <div className="mb-3 flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          enabled
                            ? "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400"
                            : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
                        }`}
                      >
                        <WrenchScrewdriverIcon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${enabled ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-500"}`}>
                          Cost Approach
                        </p>
                        <p className="mt-0.5 text-[11px] leading-tight text-gray-500 dark:text-gray-500">
                          Replacement cost new less depreciation
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto border-t border-gray-200/60 pt-3 dark:border-gray-700/40">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${enabled ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}>
                          {enabled ? "Enabled" : "Disabled"}
                        </span>
                        <ToggleSwitch
                          aria-label="Cost approach enabled"
                          value={enabled}
                          onChange={(cost) => {
                            updateProject((prev) => ({
                              ...prev,
                              approaches: {
                                ...(prev.approaches ?? DEFAULT_APPROACHES),
                                cost,
                              },
                            }));
                          }}
                        />
                      </div>
                      {!enabled && (
                        <p className="mt-2 text-[11px] leading-tight text-gray-400 dark:text-gray-600">
                          Cost report section hidden from sidebar.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Comparable Properties
              </h3>
            </div>

            <div className="flex flex-col gap-8">
              {showLandCompsSection || showSalesCompsSection ? (
                <div
                  className={`grid gap-8 md:gap-6 md:items-start ${
                    showLandCompsSection && showSalesCompsSection
                      ? "md:grid-cols-2"
                      : ""
                  }`}
                >
                  {showLandCompsSection ? (
                    <DashboardComparableSection
                      type="Land"
                      list={comparablesByType.Land}
                      projectId={projectId}
                      project={selectedProject}
                    />
                  ) : null}
                  {showSalesCompsSection ? (
                    <DashboardComparableSection
                      type="Sales"
                      list={comparablesByType.Sales}
                      projectId={projectId}
                      project={selectedProject}
                    />
                  ) : null}
                </div>
              ) : null}
              {showRentalsCompsSection ? (
                <DashboardComparableSection
                  type="Rentals"
                  list={comparablesByType.Rentals}
                  projectId={projectId}
                  project={selectedProject}
                />
              ) : null}
              {!anyComparableSectionVisible ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No comparable sections are enabled. Turn on approaches in{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Report Approaches
                  </span>{" "}
                  above.
                </p>
              ) : null}
            </div>
          </section>
      </div>
    </div>
  );
}
