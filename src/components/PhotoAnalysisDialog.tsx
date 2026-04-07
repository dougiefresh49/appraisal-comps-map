"use client";

import { useState, useCallback } from "react";
import {
  SparklesIcon,
  TagIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { DataMergeDialog } from "~/components/DataMergeDialog";
import type { PhotoAnalysis } from "~/lib/supabase-queries";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ActionMode = "relabel" | "full-analysis" | "sync-only";
type Step = "choose-action" | "select-photos" | "processing" | "sync-preview" | "done";

export interface PhotoAnalysisDialogProps {
  isOpen: boolean;
  projectId: string;
  projectFolderId: string | null | undefined;
  photos: PhotoAnalysis[];
  onClose: (didUpdate?: boolean) => void;
  onSaveCore: (core: Record<string, unknown>) => Promise<void>;
}

interface ProcessingState {
  total: number;
  completed: number;
  message: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail helper
// ─────────────────────────────────────────────────────────────────────────────

function buildThumbnailUrl(fileId: string | null, sz = "200"): string {
  if (!fileId) return "";
  return `/api/drive/thumbnail/${fileId}?sz=${sz}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action option card
// ─────────────────────────────────────────────────────────────────────────────

interface ActionCardProps {
  mode: ActionMode;
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function ActionCard({ selected, onSelect, icon, title, description }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-4 rounded-lg border p-4 text-left transition ${
        selected
          ? "border-blue-600 bg-blue-950/40 ring-1 ring-blue-600/40"
          : "border-gray-700 bg-gray-800/40 hover:border-gray-600 hover:bg-gray-800/70"
      }`}
    >
      <div
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
          selected
            ? "border-blue-700 bg-blue-900/50 text-blue-300"
            : "border-gray-700 bg-gray-800 text-gray-400"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${selected ? "text-blue-200" : "text-gray-200"}`}>
          {title}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <div
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
          selected ? "border-blue-500 bg-blue-500" : "border-gray-600"
        }`}
      >
        {selected && <div className="h-1.5 w-1.5 rounded-full bg-blue-950" />}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function PhotoAnalysisDialog({
  isOpen,
  projectId,
  projectFolderId,
  photos,
  onClose,
  onSaveCore,
}: PhotoAnalysisDialogProps) {
  const [step, setStep] = useState<Step>("choose-action");
  const [mode, setMode] = useState<ActionMode>("relabel");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [syncPreview, setSyncPreview] = useState<{
    currentCore: Record<string, unknown>;
    proposedCore: Record<string, unknown>;
  } | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [doneMessage, setDoneMessage] = useState("");

  const reset = useCallback(() => {
    setStep("choose-action");
    setMode("relabel");
    setSelectedIds(new Set());
    setProcessing(null);
    setSyncPreview(null);
    setIsMerging(false);
    setDoneMessage("");
  }, []);

  const handleClose = useCallback(
    (didUpdate = false) => {
      reset();
      onClose(didUpdate);
    },
    [reset, onClose],
  );

  const togglePhoto = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(photos.map((p) => p.fileId ?? p.id)));
  }, [photos]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Step navigation ────────────────────────────────────────────────────────

  const handleChooseAction = () => {
    if (mode === "sync-only") {
      void runSyncPreview();
    } else {
      // Pre-select all photos when moving to photo selection
      selectAll();
      setStep("select-photos");
    }
  };

  const handleStartProcessing = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setStep("processing");

    if (mode === "relabel") {
      await runRelabel(ids);
    } else {
      await runFullAnalysis(ids);
    }
  };

  // ── API calls ──────────────────────────────────────────────────────────────

  const runRelabel = async (ids: string[]) => {
    setProcessing({ total: ids.length, completed: 0, message: "Generating AI labels…" });

    try {
      const res = await fetch("/api/photos/relabel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, photoIds: ids }),
      });
      const data = (await res.json()) as { success: boolean; updatedCount?: number; error?: string };

      if (!data.success) {
        setProcessing((p) => ({
          ...p!,
          error: data.error ?? "Failed to relabel photos",
        }));
        return;
      }

      setProcessing({
        total: ids.length,
        completed: data.updatedCount ?? ids.length,
        message: `Relabeled ${data.updatedCount ?? ids.length} photo${(data.updatedCount ?? ids.length) !== 1 ? "s" : ""}`,
      });
      setDoneMessage(`Relabeled ${data.updatedCount ?? ids.length} photo${(data.updatedCount ?? ids.length) !== 1 ? "s" : ""} successfully.`);
      setStep("done");
      handleClose(true);
    } catch (err) {
      setProcessing((p) => ({
        ...p!,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  };

  const runFullAnalysis = async (ids: string[]) => {
    if (!projectFolderId) {
      setProcessing({
        total: ids.length,
        completed: 0,
        message: "Starting analysis…",
        error: "Project folder ID not available.",
      });
      return;
    }

    setProcessing({
      total: ids.length,
      completed: 0,
      message: `Starting full analysis for ${ids.length} photo${ids.length !== 1 ? "s" : ""}…`,
    });

    try {
      const res = await fetch("/api/photos/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectFolderId, projectId, photoIds: ids }),
      });
      const data = (await res.json()) as { success: boolean; totalPhotos?: number; error?: string };

      if (!data.success) {
        setProcessing((p) => ({
          ...p!,
          error: data.error ?? "Failed to start analysis",
        }));
        return;
      }

      setProcessing({
        total: data.totalPhotos ?? ids.length,
        completed: data.totalPhotos ?? ids.length,
        message: `Analysis started for ${data.totalPhotos ?? ids.length} photo${(data.totalPhotos ?? ids.length) !== 1 ? "s" : ""}. Results will appear as they are processed.`,
      });

      setDoneMessage(
        `Analysis queued for ${data.totalPhotos ?? ids.length} photo${(data.totalPhotos ?? ids.length) !== 1 ? "s" : ""}. Results will update in the background.`,
      );
      setStep("done");
      handleClose(true);
    } catch (err) {
      setProcessing((p) => ({
        ...p!,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  };

  const runSyncPreview = async () => {
    setStep("processing");
    setProcessing({ total: 1, completed: 0, message: "Generating subject data synthesis…" });

    try {
      const res = await fetch("/api/photos/synthesize-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = (await res.json()) as {
        success: boolean;
        currentCore?: Record<string, unknown>;
        proposedCore?: Record<string, unknown>;
        error?: string;
      };

      if (!data.success || !data.currentCore || !data.proposedCore) {
        setProcessing((p) => ({
          ...p!,
          error: data.error ?? "Failed to generate synthesis preview",
        }));
        return;
      }

      setSyncPreview({ currentCore: data.currentCore, proposedCore: data.proposedCore });
      setStep("sync-preview");
    } catch (err) {
      setProcessing((p) => ({
        ...p!,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  };

  const handleMergeConfirm = async (merged: Record<string, unknown>) => {
    setIsMerging(true);
    try {
      await onSaveCore(merged);
      setDoneMessage("Subject data updated successfully from photo observations.");
      setSyncPreview(null);
      setStep("done");
      handleClose(true);
    } finally {
      setIsMerging(false);
    }
  };

  if (!isOpen) return null;

  // ── Sync preview delegates to DataMergeDialog ──────────────────────────────
  if (step === "sync-preview" && syncPreview) {
    return (
      <DataMergeDialog
        isOpen
        title="Sync Photo Data with Subject"
        currentData={syncPreview.currentCore}
        proposedData={syncPreview.proposedCore}
        onConfirm={handleMergeConfirm}
        onCancel={() => handleClose(false)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "processing") handleClose();
      }}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-gray-900 shadow-2xl ring-1 ring-gray-700 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Photo Analysis</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {step === "choose-action" && "Choose what you want to do"}
              {step === "select-photos" && `Select photos to ${mode === "relabel" ? "relabel" : "re-analyze"}`}
              {step === "processing" && "Working…"}
              {step === "done" && "Complete"}
            </p>
          </div>
          {step !== "processing" && (
            <button
              type="button"
              onClick={() => handleClose()}
              className="rounded-md p-1 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {/* Step 1: Choose action */}
          {step === "choose-action" && (
            <div className="space-y-3">
              <ActionCard
                mode="relabel"
                selected={mode === "relabel"}
                onSelect={() => setMode("relabel")}
                icon={<TagIcon className="h-5 w-5" />}
                title="Generate New Labels"
                description="Use AI to regenerate labels for selected photos. Keeps existing descriptions and improvements data."
              />
              <ActionCard
                mode="full-analysis"
                selected={mode === "full-analysis"}
                onSelect={() => setMode("full-analysis")}
                icon={<SparklesIcon className="h-5 w-5" />}
                title="Full Photo Analysis"
                description="Re-classify, re-describe, and re-label selected photos. Overwrites all existing photo data."
              />
              <ActionCard
                mode="sync-only"
                selected={mode === "sync-only"}
                onSelect={() => setMode("sync-only")}
                icon={<ArrowPathIcon className="h-5 w-5" />}
                title="Sync Existing Data with Subject"
                description="Use current photo observations to suggest updates to the subject core data. Review changes before applying."
              />
            </div>
          )}

          {/* Step 2: Select photos */}
          {step === "select-photos" && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  {selectedIds.size} of {photos.length} selected
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-blue-400 hover:text-blue-300 transition"
                  >
                    Select all
                  </button>
                  <span className="text-gray-700">·</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-xs text-gray-500 hover:text-gray-300 transition"
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((photo) => {
                  const id = photo.fileId ?? photo.id;
                  const isSelected = selectedIds.has(id);
                  const thumb = buildThumbnailUrl(photo.fileId);
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => togglePhoto(id)}
                      className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition ${
                        isSelected
                          ? "border-blue-500 ring-1 ring-blue-500/40"
                          : "border-gray-700 hover:border-gray-500"
                      }`}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={photo.label}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gray-800">
                          <SparklesIcon className="h-6 w-6 text-gray-600" />
                        </div>
                      )}
                      {/* Selection overlay */}
                      <div
                        className={`absolute inset-0 transition ${
                          isSelected ? "bg-blue-600/20" : "bg-transparent group-hover:bg-gray-900/20"
                        }`}
                      />
                      {/* Checkmark */}
                      {isSelected && (
                        <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 shadow">
                          <CheckIcon className="h-3 w-3 text-white" />
                        </div>
                      )}
                      {/* Label */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1.5 pt-4">
                        <p className="truncate text-[10px] font-medium leading-tight text-white">
                          {photo.label}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Processing */}
          {step === "processing" && processing && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              {processing.error ? (
                <>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-900/40">
                    <XMarkIcon className="h-6 w-6 text-red-400" />
                  </div>
                  <p className="text-sm font-medium text-red-300">Something went wrong</p>
                  <p className="mt-2 max-w-sm text-xs text-red-400">{processing.error}</p>
                  <button
                    type="button"
                    onClick={() => handleClose()}
                    className="mt-6 rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800"
                  >
                    Close
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-900/40">
                    <ArrowPathIcon className="h-6 w-6 animate-spin text-blue-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-200">{processing.message}</p>
                  <p className="mt-1 text-xs text-gray-500">This may take a moment…</p>
                </>
              )}
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-900/40">
                <CheckIcon className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-gray-200">Done</p>
              {doneMessage && (
                <p className="mt-2 max-w-sm text-xs text-gray-400">{doneMessage}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-700 px-6 py-4 shrink-0">
          <div>
            {step === "select-photos" && (
              <button
                type="button"
                onClick={() => setStep("choose-action")}
                className="text-sm text-gray-500 transition hover:text-gray-300"
              >
                ← Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step !== "processing" && step !== "done" && (
              <button
                type="button"
                onClick={() => handleClose()}
                className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
              >
                Cancel
              </button>
            )}

            {step === "choose-action" && (
              <button
                type="button"
                onClick={handleChooseAction}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                {mode === "sync-only" ? "Generate Preview" : "Next"}
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            )}

            {step === "select-photos" && (
              <button
                type="button"
                onClick={() => void handleStartProcessing()}
                disabled={selectedIds.size === 0 || isMerging}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mode === "relabel" ? "Generate Labels" : "Start Analysis"}
                <SparklesIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
