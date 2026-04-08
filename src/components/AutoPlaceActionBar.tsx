"use client";

interface AutoPlaceActionBarProps {
  failedCount: number;
  totalCount: number;
  onApply: () => void;
  onCancel: () => void;
}

/**
 * Floating action bar that sits over the map while an auto-placement proposal
 * is active. Lets the user apply or discard the proposed positions.
 */
export function AutoPlaceActionBar({
  failedCount,
  totalCount,
  onApply,
  onCancel,
}: AutoPlaceActionBarProps) {
  const placedCount = totalCount - failedCount;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-gray-200 bg-white/95 px-5 py-3 shadow-xl backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95">
        {/* Info text */}
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Auto Placement Preview
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {placedCount} of {totalCount} placed
            {failedCount > 0 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                · {failedCount} could not be geocoded
              </span>
            )}
          </span>
        </div>

        <div className="mx-1 h-8 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Cancel */}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Cancel
        </button>

        {/* Apply */}
        <button
          type="button"
          onClick={onApply}
          disabled={placedCount === 0}
          className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply Placement
        </button>
      </div>
    </div>
  );
}
