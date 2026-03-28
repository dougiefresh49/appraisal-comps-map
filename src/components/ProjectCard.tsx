"use client";

import { useState } from "react";
import Link from "next/link";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";

interface ProjectCardProps {
  projectId: string;
  projectName: string;
  address?: string;
  clientName?: string;
  propertyType?: string;
  onArchive: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

export function ProjectCard({
  projectId,
  projectName,
  address,
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
        className="group relative flex h-full flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
      >
        <div className="space-y-4">
          <div>
            <h3 className="line-clamp-2 text-lg font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              {projectName}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {address ?? "No address provided"}
            </p>
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Client</span>
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {clientName ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Type</span>
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {propertyType ?? "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end border-t border-gray-100 pt-4 dark:border-gray-700">
          <button
            onClick={handleTrashClick}
            className="rounded-md p-1.5 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title="Delete Project"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
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
