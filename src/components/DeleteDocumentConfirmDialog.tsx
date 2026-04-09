"use client";

/**
 * Shared confirm for removing a `project_documents` row project-wide.
 */

export function DeleteDocumentConfirmDialog({
  isOpen,
  fileName,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  fileName: string | null | undefined;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Dismiss"
        onClick={isDeleting ? undefined : onCancel}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete document?</h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          This removes the document and its extracted content from the project for
          all sections and tags. This does not undo comp parse field data — use
          Parse comp files or edit fields if needed.
        </p>
        {fileName?.trim() ? (
          <p className="mt-3 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 dark:border-gray-800 dark:bg-gray-950/80 dark:text-gray-300">
            {fileName.trim()}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
