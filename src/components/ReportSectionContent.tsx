"use client";

import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type ReportSection } from "~/server/reports/actions";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });
const MarkdownPreview = dynamic(() => import("@uiw/react-markdown-preview"), {
  ssr: false,
});

type ReportAction = "generate" | "get" | "update" | "regenerate";

interface ReportSectionContentProps {
  projectFolderId?: string;
  section: ReportSection;
  title: string;
  description?: string;
}

interface RequestState {
  isLoading: boolean;
  isSaving: boolean;
  isGenerating: boolean;
  isRegenerating: boolean;
}

const DEFAULT_STATE: RequestState = {
  isLoading: false,
  isSaving: false,
  isGenerating: false,
  isRegenerating: false,
};

export function ReportSectionContent({
  projectFolderId,
  section,
  title,
  description,
}: ReportSectionContentProps) {
  const [content, setContent] = useState<string>("");
  const [exists, setExists] = useState<boolean | null>(null);
  const [state, setState] = useState<RequestState>(DEFAULT_STATE);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerationContext, setRegenerationContext] = useState("");

  const hasContent = useMemo(() => {
    const trimmed = content.trim();
    if (exists === false) return false;
    if (exists === true) return trimmed.length > 0;
    return trimmed.length > 0;
  }, [content, exists]);

  const updateState = useCallback((partial: Partial<RequestState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

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
      const message =
        err instanceof Error ? err.message : "Failed to copy content.";
      setError(message);
    }
  }, [content]);

  const postAction = useCallback(
    async (
      action: ReportAction,
      nextContent?: string,
      context?: string,
      previousContent?: string,
    ) => {
      if (!projectFolderId) {
        setError("Missing Project Folder ID for this project.");
        return null;
      }

      resetTransient();

      const flags: Partial<RequestState> = {
        isLoading: action === "get",
        isSaving: action === "update",
        isGenerating: action === "generate",
        isRegenerating: action === "regenerate",
      };
      updateState(flags);

      try {
        const body: Record<string, unknown> = {
          projectFolderId,
          action,
          section,
          content: nextContent,
        };

        if (action === "regenerate") {
          if (previousContent) {
            body.previousContent = previousContent;
          }
          if (context) {
            body.regenerationContext = context;
          }
        }

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
          throw new Error(payload.error || "Failed to process request");
        }

        const received = payload.content ?? "";
        const existsFlag =
          typeof payload.exists === "boolean"
            ? payload.exists
            : received.trim().length > 0;
        setContent(received);
        setExists(existsFlag);

        if (action === "update") {
          setMessage("Saved successfully.");
          setIsEditing(false);
        } else if (action === "generate") {
          setMessage("Content generated.");
          // Refresh content immediately after a successful generate.
          void postAction("get");
        } else if (action === "regenerate") {
          setMessage("Content regenerated.");
          setIsEditing(false);
          // Refresh content immediately after a successful regenerate.
          void postAction("get");
        } else {
          setMessage(null);
        }

        return received;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unexpected error occurred";
        setError(message);
        setExists(null);
        return null;
      } finally {
        updateState(DEFAULT_STATE);
      }
    },
    [projectFolderId, section, updateState],
  );

  useEffect(() => {
    if (!projectFolderId) {
      setExists(null);
      return;
    }
    void postAction("get");
  }, [postAction, projectFolderId]);

  const isBusy =
    state.isLoading ||
    state.isSaving ||
    state.isGenerating ||
    state.isRegenerating;

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
          {state.isLoading
            ? "Loading..."
            : state.isSaving
              ? "Saving..."
              : state.isGenerating
                ? "Generating..."
                : state.isRegenerating
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

      {!projectFolderId ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Add a Project Folder ID to the project to enable report actions.
        </div>
      ) : null}

      {!isBusy && !hasContent ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="mb-3 text-sm text-gray-600">
            No content found for this section.
          </p>
          <button
            type="button"
            onClick={() => postAction("generate")}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={!projectFolderId}
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
              onClick={() => setIsEditing((prev) => !prev)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy || !projectFolderId}
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
                value={content}
                onChange={(value) => setContent(value ?? "")}
                height={480}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => postAction("update", content)}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
                  disabled={isBusy || !projectFolderId}
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

      {/* Regenerate Dialog */}
      {showRegenerateDialog && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
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
                  void postAction(
                    "regenerate",
                    undefined,
                    regenerationContext.trim() || undefined,
                    content,
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
