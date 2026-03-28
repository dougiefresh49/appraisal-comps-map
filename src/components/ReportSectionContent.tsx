"use client";

import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

import dynamic from "next/dynamic";
import { useCallback, useState, type ReactNode } from "react";
import { type ReportSection } from "~/server/reports/actions";
import { useReportSection } from "~/hooks/useReportSection";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });
const MarkdownPreview = dynamic(() => import("@uiw/react-markdown-preview"), {
  ssr: false,
});

interface ReportSectionContentProps {
  projectId: string;
  projectFolderId?: string;
  section: ReportSection;
  title: string;
  description?: string;
  /** Shown inside the dashed empty state above the generate button */
  emptyStateNote?: ReactNode;
}

export function ReportSectionContent({
  projectId,
  projectFolderId,
  section,
  title,
  description,
  emptyStateNote,
}: ReportSectionContentProps) {
  const {
    content,
    exists: hasContent,
    isLoading,
    updateContent,
    refreshSection,
  } = useReportSection(projectId, section);

  const [editContent, setEditContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerationContext, setRegenerationContext] = useState("");

  const resetTransient = () => {
    setError(null);
    setMessage(null);
  };

  const handleCopy = useCallback(async () => {
    resetTransient();
    if (!content.trim()) {
      setError("Nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setMessage("Copied to clipboard.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to copy content.",
      );
    }
  }, [content]);

  const handleStartEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleSave = async () => {
    resetTransient();
    setIsSaving(true);
    try {
      await updateContent(editContent);
      setMessage("Saved successfully.");
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const callGenerateApi = async (
    action: "generate" | "regenerate",
    previousContent?: string,
    context?: string,
  ) => {
    if (!projectFolderId) {
      setError("Project Folder ID is required for generation.");
      return;
    }

    resetTransient();
    if (action === "regenerate") {
      setIsRegenerating(true);
    } else {
      setIsGenerating(true);
    }

    try {
      const body: Record<string, unknown> = {
        projectId,
        projectFolderId,
        action,
        section,
      };

      if (previousContent) body.previousContent = previousContent;
      if (context) body.regenerationContext = context;

      const response = await fetch("/api/report-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as {
        content?: string;
        error?: string;
        exists?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to process request");
      }

      setMessage(
        action === "generate"
          ? "Content generated."
          : "Content regenerated.",
      );
      setIsEditing(false);
      void refreshSection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsGenerating(false);
      setIsRegenerating(false);
    }
  };

  const isBusy = isLoading || isSaving || isGenerating || isRegenerating;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
          {description ? (
            <p className="text-sm text-gray-500">{description}</p>
          ) : null}
        </div>
        <div className="text-xs text-gray-500">
          {isLoading
            ? "Loading..."
            : isSaving
              ? "Saving..."
              : isGenerating
                ? "Generating..."
                : isRegenerating
                  ? "Regenerating..."
                  : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </div>
      ) : null}

      {!projectId ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A project must be selected to enable report actions.
        </div>
      ) : null}

      {!isBusy && !hasContent ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="mb-3 text-sm text-gray-600">
            No content found for this section.
          </p>
          {emptyStateNote ? (
            <p className="mb-3 text-xs text-gray-500">{emptyStateNote}</p>
          ) : null}
          <button
            type="button"
            onClick={() => callGenerateApi("generate")}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={!projectFolderId || isBusy}
          >
            Generate Content
          </button>
        </div>
      ) : null}

      {hasContent ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => (isEditing ? setIsEditing(false) : handleStartEdit())}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy}
            >
              {isEditing ? "Cancel Edit" : "Edit"}
            </button>
            <button
              type="button"
              onClick={() => setShowRegenerateDialog(true)}
              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy || !projectFolderId}
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy || !hasContent}
            >
              Copy
            </button>
          </div>

          {isEditing ? (
            <div className="space-y-4" data-color-mode="light">
              <MDEditor
                value={editContent}
                onChange={(value) => setEditContent(value ?? "")}
                height={480}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
                  disabled={isBusy}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  disabled={isBusy}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className="prose max-w-none rounded-md border border-gray-100 bg-gray-50 p-4 text-gray-900"
              data-color-mode="light"
            >
              <MarkdownPreview source={content} />
            </div>
          )}
        </div>
      ) : null}

      {showRegenerateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Regenerate Content
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Provide additional context to guide the regeneration. The
                previous content will be included automatically.
              </p>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Additional Context (Optional)
              </label>
              <textarea
                value={regenerationContext}
                onChange={(e) => setRegenerationContext(e.target.value)}
                placeholder="e.g., Make it more concise, focus on X aspect, add information about Y..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                rows={6}
              />
            </div>

            <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-600">
                Previous Content (will be sent automatically):
              </p>
              <p className="line-clamp-3 text-xs text-gray-500">
                {content.substring(0, 200)}
                {content.length > 200 ? "..." : ""}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRegenerateDialog(false);
                  setRegenerationContext("");
                }}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                disabled={isBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRegenerateDialog(false);
                  void callGenerateApi(
                    "regenerate",
                    content,
                    regenerationContext.trim() || undefined,
                  );
                  setRegenerationContext("");
                }}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                disabled={isBusy || !projectFolderId}
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
