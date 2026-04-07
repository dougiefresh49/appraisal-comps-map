"use client";

import {
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { ArrowPathIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";

export type PushToSheetButtonHandle = {
  openConfirm: () => void;
};

interface PushToSheetButtonProps {
  /** The fetch callback that performs the actual push. Should throw on error. */
  onPush: () => Promise<void>;
  /** Description shown in the confirmation dialog (e.g. "land comp #3 to the 'land comps' sheet"). */
  confirmDescription: string;
  /** Optional extra detail shown below the description. */
  confirmDetail?: string;
  /** Button label. Defaults to "Push to Sheet". */
  label?: string;
  /** Icon-only square button (matches comparables toolbar). */
  iconOnly?: boolean;
  /** Extra Tailwind classes on the button element. */
  className?: string;
  /** Whether the button should be disabled (e.g. no data yet). */
  disabled?: boolean;
  /** Success / error messages next to the button (default true). Set false if the parent shows feedback. */
  showInlineFeedback?: boolean;
  /** Native tooltip on the trigger (default: generic push explanation). */
  triggerTitle?: string;
  /** When true, no native `title` (e.g. parent shows a custom CSS hover hint). */
  omitNativeTitle?: boolean;
  /** Fires whenever push status or error message changes. */
  onStatusChange?: (state: {
    status: "idle" | "pushing" | "success" | "error";
    errorMessage: string | null;
  }) => void;
}

/**
 * Small secondary-style button that confirms + pushes data to the Google Spreadsheet.
 * Shows a confirmation dialog, then calls the onPush callback.
 * Displays inline success/error feedback.
 */
export const PushToSheetButton = forwardRef<
  PushToSheetButtonHandle,
  PushToSheetButtonProps
>(function PushToSheetButton(
  {
    onPush,
    confirmDescription,
    confirmDetail,
    label = "Push to Sheet",
    iconOnly = false,
    className = "",
    disabled = false,
    showInlineFeedback = true,
    triggerTitle = "Push this data to the connected Google Spreadsheet (opens a confirmation first).",
    omitNativeTitle = false,
    onStatusChange,
  },
  ref,
) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "pushing" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    openConfirm: () => setShowConfirm(true),
  }));

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  useEffect(() => {
    onStatusChangeRef.current?.({ status, errorMessage });
  }, [status, errorMessage]);

  const handleConfirm = useCallback(async () => {
    setShowConfirm(false);
    setStatus("pushing");
    setErrorMessage(null);
    try {
      await onPush();
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to push to spreadsheet";
      setErrorMessage(msg);
      setStatus("error");
      setTimeout(() => {
        setStatus("idle");
        setErrorMessage(null);
      }, 6000);
    }
  }, [onPush]);

  const triggerSize = iconOnly ? "h-8 w-8" : "";
  const iconSize = iconOnly ? "h-4 w-4" : "h-3.5 w-3.5";

  const confirmDialog =
    showConfirm &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={() => setShowConfirm(false)}
        role="presentation"
      >
        <div
          className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="push-to-sheet-title"
        >
          <h3
            id="push-to-sheet-title"
            className="mb-2 text-sm font-semibold text-gray-100"
          >
            Push to Google Spreadsheet?
          </h3>
          <p className="mb-1 text-sm text-gray-400">
            This will write{" "}
            <span className="font-medium text-gray-200">
              {confirmDescription}
            </span>
            .
          </p>
          {confirmDetail && (
            <p className="mb-4 text-xs text-gray-500">{confirmDetail}</p>
          )}
          {!confirmDetail && <div className="mb-4" />}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="rounded-md px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              Push to Sheet
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={disabled || status === "pushing"}
        {...(omitNativeTitle
          ? { "aria-label": iconOnly ? "Push to Sheet" : undefined }
          : {
              title: triggerTitle,
              "aria-label": iconOnly ? triggerTitle : undefined,
            })}
        className={
          iconOnly
            ? `inline-flex ${triggerSize} shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-800/80 text-gray-300 transition hover:border-emerald-700 hover:bg-emerald-950/30 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 ${className}`
            : `inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800/80 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition hover:border-emerald-700 hover:bg-emerald-950/30 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 ${className}`
        }
      >
        {status === "pushing" ? (
          <ArrowPathIcon
            className={`${iconSize} shrink-0 animate-spin`}
            aria-hidden
          />
        ) : (
          <ArrowUpTrayIcon className={`${iconSize} shrink-0`} aria-hidden />
        )}
        {!iconOnly && (status === "pushing" ? "Pushing…" : label)}
      </button>

      {/* Inline status feedback */}
      {showInlineFeedback && status === "success" && (
        <span className="text-xs font-medium text-emerald-400">
          ✓ Pushed to sheet
        </span>
      )}
      {showInlineFeedback && status === "error" && errorMessage && (
        <span
          className="max-w-xs truncate text-xs text-red-400"
          title={errorMessage}
        >
          ✗ {errorMessage}
        </span>
      )}

      {confirmDialog}
    </>
  );
});

PushToSheetButton.displayName = "PushToSheetButton";
