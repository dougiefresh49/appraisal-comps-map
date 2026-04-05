"use client";

import { useState } from "react";
import Link from "next/link";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";

interface ProjectCardProps {
  projectId: string;
  projectName: string;
  address?: string;
  effectiveDate?: string;
  /** Shown as "Report date" — sourced from `projects.report_due_date`. */
  reportDate?: string;
  clientName?: string;
  propertyType?: string;
  onArchive: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

export function ProjectCard({
  projectId,
  projectName,
  address,
  effectiveDate,
  reportDate,
  clientName,
  propertyType,
  onArchive,
  onDelete,
}: ProjectCardProps) {
  const [showDialog, setShowDialog] = useState(false);

  const handleTrashClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDialog(true);
  };

  return (
    <>
      <Link
        href={`/project/${projectId}`}
        className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
      >
        {/* Trash button — absolute so it never affects card height */}
        <button
          onClick={handleTrashClick}
          className="absolute right-2.5 top-2.5 rounded-md p-1.5 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          title="Delete Project"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>

        {/* Project name + address */}
        <div className="pr-6">
          <h3 className="line-clamp-1 text-base font-semibold leading-snug text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400" title={projectName}>
            {projectName}
          </h3>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {address ?? "No address provided"}
          </p>
        </div>

        {/* Dates */}
        <dl className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs dark:border-gray-700">
          <div className="flex items-center gap-2">
            <dt className="w-[90px] shrink-0 text-gray-400 dark:text-gray-500">
              Effective date
            </dt>
            <dd className="min-w-0 flex-1 truncate text-right font-medium text-gray-700 dark:text-gray-200">
              {effectiveDate?.trim() ? effectiveDate : "—"}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-[90px] shrink-0 text-gray-400 dark:text-gray-500">
              Report date
            </dt>
            <dd className="min-w-0 flex-1 truncate text-right font-medium text-gray-700 dark:text-gray-200">
              {reportDate?.trim() ? reportDate : "—"}
            </dd>
          </div>
        </dl>

        {/* Client + Type */}
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="w-[90px] shrink-0 text-gray-400 dark:text-gray-500">
              Client
            </span>
            <span
              className="min-w-0 flex-1 truncate text-right font-medium text-gray-700 dark:text-gray-200"
              title={clientName?.trim() ? clientName : undefined}
            >
              {clientName?.trim() ? clientName : "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[90px] shrink-0 text-gray-400 dark:text-gray-500">
              Type
            </span>
            <span className="min-w-0 flex-1 truncate text-right font-medium text-gray-700 dark:text-gray-200">
              {propertyType?.trim() ? propertyType : "—"}
            </span>
          </div>
        </div>
      </Link>

      {showDialog && (
        <ProjectDeleteDialog
          projectName={projectName}
          onArchive={() => {
            setShowDialog(false);
            onArchive(projectId);
          }}
          onDelete={() => {
            setShowDialog(false);
            onDelete(projectId);
          }}
          onCancel={() => setShowDialog(false)}
        />
      )}
    </>
  );
}
