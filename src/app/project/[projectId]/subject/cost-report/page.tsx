"use client";

import {
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  CloudArrowUpIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  EyeIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useProject } from "~/hooks/useProject";
import { driveFetch } from "~/lib/drive-fetch";

type ViewTab = "preview" | "code";
type LayoutMode = "split" | "single";

interface FolderStructure {
  costReportFolderId?: string;
  [key: string]: unknown;
}

interface DriveListFile {
  id: string;
  name: string;
  mimeType: string;
}

interface SubjectCostReportPageProps {
  params: Promise<{ projectId: string }>;
}

function isHtmlFile(f: DriveListFile): boolean {
  const n = f.name.toLowerCase();
  return (
    f.mimeType === "text/html" ||
    f.mimeType === "application/xhtml+xml" ||
    n.endsWith(".html") ||
    n.endsWith(".htm")
  );
}

function SinglePanelIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Draggable split-pane container
───────────────────────────────────────────── */
function SplitPane({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPct, setSplitPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => setDragging(false);

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 ${dragging ? "cursor-col-resize select-none" : ""}`}
    >
      {/* Left panel */}
      <div
        className="flex min-w-0 flex-col overflow-hidden"
        style={{ width: `${splitPct}%` }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">{left}</div>
      </div>

      {/* Drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        className={`group relative flex w-2 shrink-0 cursor-col-resize flex-col items-center justify-center bg-gray-100 transition-colors hover:bg-blue-50 dark:bg-gray-900 dark:hover:bg-blue-950/40 ${dragging ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}
      >
        {/* Center divider line */}
        <div
          className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${dragging ? "bg-blue-400" : "bg-gray-300 group-hover:bg-blue-400 dark:bg-gray-700 dark:group-hover:bg-blue-500"}`}
        />
        {/* Grip dots */}
        <div className="relative z-10 flex flex-col gap-[3px]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-[3px] w-[3px] rounded-full transition-colors ${dragging ? "bg-blue-400" : "bg-gray-400 group-hover:bg-blue-400 dark:bg-gray-600 dark:group-hover:bg-blue-400"}`}
            />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div
        className="relative flex min-w-0 flex-col overflow-hidden"
        style={{ width: `calc(${100 - splitPct}% - 8px)` }}
      >
        {/* Transparent overlay blocks iframe from eating pointer events while dragging */}
        {dragging && <div className="absolute inset-0 z-10" />}
        <div className="flex flex-1 flex-col overflow-hidden">{right}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
export default function SubjectCostReportPage({ params }: SubjectCostReportPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);

  const { project, isLoading: projectLoading } = useProject(decodedProjectId);

  const [files, setFiles] = useState<DriveListFile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [editorHtml, setEditorHtml] = useState("");
  const [savedHtml, setSavedHtml] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [layout, setLayout] = useState<LayoutMode>("single");
  const [activeTab, setActiveTab] = useState<ViewTab>("preview");

  const raw = project as unknown as Record<string, unknown> | undefined;
  const folderStructure = (raw?.folderStructure ??
    raw?.folder_structure) as FolderStructure | undefined;
  const costReportFolderId = folderStructure?.costReportFolderId;

  const htmlFiles = useMemo(() => files.filter(isHtmlFile), [files]);
  const selectedFile = htmlFiles.find((f) => f.id === selectedFileId) ?? null;
  const isDirty = editorHtml !== savedHtml;

  const loadFiles = useCallback(async () => {
    if (!costReportFolderId) {
      setFiles([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await driveFetch("/api/drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: costReportFolderId, filesOnly: true }),
      });
      const data = (await res.json()) as {
        files?: DriveListFile[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setFiles(data.files ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load cost report folder");
      setFiles([]);
    } finally {
      setListLoading(false);
    }
  }, [costReportFolderId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (htmlFiles.length === 0) {
      setSelectedFileId(null);
      return;
    }
    setSelectedFileId((prev) => {
      if (prev && htmlFiles.some((f) => f.id === prev)) return prev;
      return htmlFiles[0]!.id;
    });
  }, [htmlFiles]);

  useEffect(() => {
    if (!selectedFileId) {
      setEditorHtml("");
      setSavedHtml("");
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setContentError(null);
    void (async () => {
      try {
        const res = await driveFetch(
          `/api/drive/file/${encodeURIComponent(selectedFileId)}`,
        );
        const text = await res.text();
        if (!res.ok) {
          let message = `Request failed (${res.status})`;
          try {
            const err = JSON.parse(text) as { error?: string };
            if (err.error) message = err.error;
          } catch {
            /* use default message */
          }
          throw new Error(message);
        }
        if (!cancelled) {
          setEditorHtml(text);
          setSavedHtml(text);
        }
      } catch (e) {
        if (!cancelled) {
          setContentError(e instanceof Error ? e.message : "Failed to load file content");
          setEditorHtml("");
          setSavedHtml("");
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedFileId]);

  const onPickFile = (nextId: string) => {
    if (nextId === selectedFileId) return;
    if (isDirty && !globalThis.confirm("Discard unsaved changes?")) return;
    setSelectedFileId(nextId);
  };

  const revert = () => {
    if (!isDirty) return;
    if (!globalThis.confirm("Revert all edits since the last save?")) return;
    setEditorHtml(savedHtml);
  };

  const save = async () => {
    if (!selectedFileId || !isDirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await driveFetch(
        `/api/drive/file/${encodeURIComponent(selectedFileId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editorHtml }),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Save failed (${res.status})`);
      }
      setSavedHtml(editorHtml);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const isLoading = projectLoading || listLoading;

  return (
    <div className="flex min-h-full flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {/* Page header */}
      <div className="shrink-0 px-5 pb-2 pt-5 md:px-7 md:pt-6">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Cost report
        </h1>
      </div>

      {/* Loading / empty states */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-500" />
        </div>
      ) : !costReportFolderId ? (
        <EmptyState
          message={
            <>
              No cost report folder linked. Project setup should discover{" "}
              <code className="rounded bg-gray-100 px-1 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                reports/cost-report
              </code>
              .
            </>
          }
        />
      ) : listError ? (
        <div className="mx-5 mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 md:mx-7">
          {listError}
        </div>
      ) : htmlFiles.length === 0 ? (
        <EmptyState message="No HTML file found in the cost report folder." />
      ) : (
        /* Editor workspace */
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 md:px-7 md:pb-6">
          {/* Toolbar */}
          <div className="mb-2 flex h-10 shrink-0 items-center gap-2">
            {/* Left: view toggle (single only) + file + status */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {layout === "single" && (
                <div className="flex items-center rounded-md border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab("preview")}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      activeTab === "preview"
                        ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    }`}
                  >
                    <EyeIcon className="h-3.5 w-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("code")}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      activeTab === "code"
                        ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    }`}
                  >
                    <CodeBracketIcon className="h-3.5 w-3.5" />
                    Code
                  </button>
                </div>
              )}

              {htmlFiles.length > 1 ? (
                <select
                  value={selectedFileId ?? ""}
                  onChange={(e) => onPickFile(e.target.value)}
                  className="max-w-[200px] truncate rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:border-blue-600"
                >
                  {htmlFiles.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              ) : (
                <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {selectedFile?.name}
                </span>
              )}

              {isDirty ? (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                  Unsaved
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                  Saved
                </span>
              )}
            </div>

            {/* Right: actions + layout toggle */}
            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={`https://drive.google.com/file/d/${selectedFileId}/view`}
                target="_blank"
                rel="noreferrer"
                title="Open in Drive"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
              >
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => revert()}
                disabled={!isDirty || saving || contentLoading}
                title="Revert changes"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition enabled:hover:border-gray-300 enabled:hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:enabled:hover:border-gray-600 dark:enabled:hover:text-gray-200"
              >
                <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!isDirty || saving || contentLoading}
                className="flex h-7 items-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-2.5 text-xs font-medium text-white transition enabled:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-30 dark:border-blue-700/80 dark:bg-blue-600/90"
              >
                <CloudArrowUpIcon className="h-3.5 w-3.5 shrink-0" />
                {saving ? "Saving…" : "Save"}
              </button>

              {/* Layout toggle */}
              <div className="ml-1 flex items-center rounded-md border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={() => setLayout("split")}
                  title="Split view"
                  className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                    layout === "split"
                      ? "bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                      : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  }`}
                >
                  <ViewColumnsIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayout("single")}
                  title="Single view"
                  className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                    layout === "single"
                      ? "bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                      : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  }`}
                >
                  <SinglePanelIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Error banners */}
          {saveError ? (
            <div className="mb-2 shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {saveError}
            </div>
          ) : null}

          {/* Panels */}
          {contentError ? (
            <div className="flex-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {contentError}
            </div>
          ) : contentLoading ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-500" />
            </div>
          ) : layout === "split" ? (
            <SplitPane
              left={<CodePanel value={editorHtml} onChange={setEditorHtml} />}
              right={<PreviewPanel html={editorHtml} fileId={selectedFileId} />}
            />
          ) : activeTab === "code" ? (
            <CodePanel
              value={editorHtml}
              onChange={setEditorHtml}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-800"
            />
          ) : (
            <PreviewPanel
              html={editorHtml}
              fileId={selectedFileId}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-800"
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */

function EmptyState({ message }: { message: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <DocumentTextIcon className="h-10 w-10 text-gray-300 dark:text-gray-700" />
      <p className="text-sm text-gray-500 dark:text-gray-500">{message}</p>
    </div>
  );
}

function CodePanel({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-1 min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 ${className}`}>
      <div className="flex h-8 shrink-0 items-center border-b border-gray-200 bg-gray-100 px-3 dark:border-gray-800 dark:bg-gray-900/80">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
          HTML Source
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        aria-label="Cost report HTML source"
        className="min-h-0 flex-1 resize-none bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-800 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30 dark:bg-gray-950/80 dark:text-gray-300 md:text-xs"
      />
    </div>
  );
}

function PreviewPanel({
  html,
  fileId,
  className = "",
}: {
  html: string;
  fileId: string | null;
  className?: string;
}) {
  return (
    <div className={`flex flex-1 min-h-0 flex-col overflow-hidden bg-white ${className}`}>
      <div className="flex h-8 shrink-0 items-center border-b border-gray-200 bg-gray-50 px-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Live Preview
        </span>
      </div>
      <iframe
        key={fileId ?? "none"}
        title="Cost report preview"
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin allow-popups"
        className="min-h-0 w-full flex-1 bg-white"
      />
    </div>
  );
}
