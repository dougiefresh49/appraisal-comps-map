"use client";

interface ProjectDeleteDialogProps {
  projectName: string;
  onArchive: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function ProjectDeleteDialog({
  projectName,
  onArchive,
  onDelete,
  onCancel,
}: ProjectDeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-gray-500/75 transition-opacity dark:bg-gray-900/80"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md transform overflow-hidden rounded-lg bg-white px-6 pb-6 pt-5 shadow-xl transition-all dark:border dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-1 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-red-600 dark:text-red-400"
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
          </div>
          <div>
            <h3 className="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100">
              Remove &ldquo;{projectName}&rdquo;
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              How would you like to handle this project?
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              Archive
            </p>
            <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400">
              Hides the project from the list. All data is kept and can be
              restored by clearing the{" "}
              <code className="font-mono">archived_at</code> flag in the
              database.
            </p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-900 dark:text-red-200">
              Delete
            </p>
            <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
              Permanently removes the project and all associated data. This
              cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            Archive
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:bg-red-500 dark:hover:bg-red-400"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
