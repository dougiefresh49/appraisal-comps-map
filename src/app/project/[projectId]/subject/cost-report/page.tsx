"use client";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  ArrowUpIcon,
  CloudArrowUpIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  EyeIcon,
  PhotoIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import {
  type Dispatch,
  type SetStateAction,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  reportMapsFolderId?: string;
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

/** Defaults when opening the screenshot flow (matches typical letter crop + zoom). */
const DEFAULT_COST_REPORT_CAPTURE: {
  documentFrameSize: number;
  previewZoom: number;
  frameOffsetX: number;
  frameOffsetY: number;
} = {
  documentFrameSize: 0.99,
  previewZoom: 0.89,
  frameOffsetX: 0,
  frameOffsetY: -72,
};

function isHtmlFile(f: DriveListFile): boolean {
  const n = f.name.toLowerCase();
  return (
    f.mimeType === "text/html" ||
    f.mimeType === "application/xhtml+xml" ||
    n.endsWith(".html") ||
    n.endsWith(".htm")
  );
}

/** US Letter aspect dimensions for the capture frame (matches map screenshot crop). */
function getCostReportFrameDimensions(
  containerWidth: number,
  containerHeight: number,
  documentFrameSize: number,
): { docWidth: number; docHeight: number } {
  const documentAspectRatio = 8.5 / 11;
  let docWidth = containerWidth * 0.9 * documentFrameSize;
  let docHeight = docWidth / documentAspectRatio;
  if (docHeight > containerHeight * 0.9 * documentFrameSize) {
    docHeight = containerHeight * 0.9 * documentFrameSize;
    docWidth = docHeight * documentAspectRatio;
  }
  return { docWidth, docHeight };
}

/** Letter frame position; offsets shift the frame from center (px). Clamped to stay inside the container. */
function getCostReportFrameRect(
  containerWidth: number,
  containerHeight: number,
  documentFrameSize: number,
  offsetX = 0,
  offsetY = 0,
): { x: number; y: number; docWidth: number; docHeight: number } {
  const { docWidth, docHeight } = getCostReportFrameDimensions(
    containerWidth,
    containerHeight,
    documentFrameSize,
  );
  const x0 = (containerWidth - docWidth) / 2;
  const y0 = (containerHeight - docHeight) / 2;
  let x = x0 + offsetX;
  let y = y0 + offsetY;
  x = Math.min(Math.max(0, x), Math.max(0, containerWidth - docWidth));
  y = Math.min(Math.max(0, y), Math.max(0, containerHeight - docHeight));
  return { x, y, docWidth, docHeight };
}

/** Applies CSS zoom inside the iframe (capture mode only). */
function applyPreviewZoomToIframe(
  iframe: HTMLIFrameElement,
  captureFraming: boolean,
  zoom: number,
) {
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) return;
  const htmlEl = doc.documentElement;
  if (!captureFraming) {
    htmlEl.style.zoom = "";
    return;
  }
  const z = Math.min(Math.max(zoom, 0.05), 1);
  htmlEl.style.zoom = String(z);
}

/** Sets iframe height to document height so content is not clipped; min height matches the preview panel. */
function fitCostReportPreviewIframe(
  iframe: HTMLIFrameElement,
  onSized?: () => void,
) {
  const doc = iframe.contentDocument;
  if (!doc?.body) return;

  const htmlEl = doc.documentElement;
  requestAnimationFrame(() => {
    const sh = Math.max(doc.body.scrollHeight, htmlEl.scrollHeight);
    const parent = iframe.parentElement;
    const minH = parent?.clientHeight ?? 0;
    iframe.style.height = `${Math.ceil(Math.max(sh, minH))}px`;
    requestAnimationFrame(() => onSized?.());
  });
}

/**
 * Temporarily replaces cross-origin img src and CSS background-image URLs
 * inside an iframe document with proxied versions so html-to-image can embed
 * them without hitting CORS. Returns a cleanup function that restores originals.
 */
async function proxyIframeImagesForCapture(
  iframeDoc: Document,
): Promise<() => void> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const restores: Array<() => void> = [];

  const imgs = Array.from(
    iframeDoc.querySelectorAll<HTMLImageElement>("img[src]"),
  );

  for (const img of imgs) {
    const src = img.getAttribute("src") ?? "";
    if (!src || src.startsWith("data:") || src.startsWith(origin) || src.startsWith("/")) {
      continue;
    }
    const proxied = `/api/proxy-image?url=${encodeURIComponent(src)}`;
    img.setAttribute("src", proxied);
    restores.push(() => img.setAttribute("src", src));
  }

  // Wait for proxied images to finish loading
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) { resolve(); return; }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );

  return () => restores.forEach((r) => r());
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
      <div
        className="flex min-w-0 flex-col overflow-hidden"
        style={{ width: `${splitPct}%` }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">{left}</div>
      </div>

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
        <div
          className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${dragging ? "bg-blue-400" : "bg-gray-300 group-hover:bg-blue-400 dark:bg-gray-700 dark:group-hover:bg-blue-500"}`}
        />
        <div className="relative z-10 flex flex-col gap-[3px]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-[3px] w-[3px] rounded-full transition-colors ${dragging ? "bg-blue-400" : "bg-gray-400 group-hover:bg-blue-400 dark:bg-gray-600 dark:group-hover:bg-blue-400"}`}
            />
          ))}
        </div>
      </div>

      <div
        className="relative flex min-w-0 flex-col overflow-hidden"
        style={{ width: `calc(${100 - splitPct}% - 8px)` }}
      >
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
  const [exportImageError, setExportImageError] = useState<string | null>(null);
  const [exportingImage, setExportingImage] = useState(false);

  const [layout, setLayout] = useState<LayoutMode>("single");
  const [activeTab, setActiveTab] = useState<ViewTab>("preview");

  const [captureFraming, setCaptureFraming] = useState(false);
  const [hideCaptureOverlay, setHideCaptureOverlay] = useState(false);
  const [documentFrameSize, setDocumentFrameSize] = useState(
    DEFAULT_COST_REPORT_CAPTURE.documentFrameSize,
  );
  const [previewZoom, setPreviewZoom] = useState(DEFAULT_COST_REPORT_CAPTURE.previewZoom);
  const [frameOffsetX, setFrameOffsetX] = useState(DEFAULT_COST_REPORT_CAPTURE.frameOffsetX);
  const [frameOffsetY, setFrameOffsetY] = useState(DEFAULT_COST_REPORT_CAPTURE.frameOffsetY);

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

  const beginSaveImageFlow = () => {
    setExportImageError(null);
    setLayout("single");
    setActiveTab("preview");
    setCaptureFraming(true);
    setDocumentFrameSize(DEFAULT_COST_REPORT_CAPTURE.documentFrameSize);
    setPreviewZoom(DEFAULT_COST_REPORT_CAPTURE.previewZoom);
    setFrameOffsetX(DEFAULT_COST_REPORT_CAPTURE.frameOffsetX);
    setFrameOffsetY(DEFAULT_COST_REPORT_CAPTURE.frameOffsetY);
  };

  const cancelCapture = useCallback(() => {
    setCaptureFraming(false);
    setHideCaptureOverlay(false);
    setDocumentFrameSize(DEFAULT_COST_REPORT_CAPTURE.documentFrameSize);
    setPreviewZoom(DEFAULT_COST_REPORT_CAPTURE.previewZoom);
    setFrameOffsetX(DEFAULT_COST_REPORT_CAPTURE.frameOffsetX);
    setFrameOffsetY(DEFAULT_COST_REPORT_CAPTURE.frameOffsetY);
  }, []);

  useEffect(() => {
    if (!captureFraming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelCapture();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [captureFraming, cancelCapture]);

  const confirmCaptureToFile = async () => {
    setExportImageError(null);
    setHideCaptureOverlay(true);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    setExportingImage(true);
    try {
      const container = document.getElementById("cost-report-capture-container");
      if (!container) {
        throw new Error("Preview area not found — try again.");
      }

      const cw = container.scrollWidth;
      const ch = container.scrollHeight;
      if (cw < 8 || ch < 8) {
        throw new Error("Preview area is too small to capture.");
      }

      const { x, y, docWidth, docHeight } = getCostReportFrameRect(
        cw,
        ch,
        documentFrameSize,
        frameOffsetX,
        frameOffsetY,
      );

      const { toPng } = await import("html-to-image");

      // Proxy cross-origin images so html-to-image can embed them without CORS errors
      const iframe = container.querySelector<HTMLIFrameElement>("iframe");
      const restoreImages = iframe?.contentDocument
        ? await proxyIframeImagesForCapture(iframe.contentDocument)
        : undefined;

      let dataUrl: string;
      try {
        dataUrl = await toPng(container, {
          cacheBust: false,
          pixelRatio: 2,
          backgroundColor: "#ffffff",
          skipFonts: true,
        });
      } finally {
        restoreImages?.();
      }

      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to decode capture"));
      });

      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = docWidth * scale;
      canvas.height = docHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available");

      ctx.drawImage(
        img,
        x * scale,
        y * scale,
        docWidth * scale,
        docHeight * scale,
        0,
        0,
        docWidth * scale,
        docHeight * scale,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Failed to create PNG");

      try {
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        if ((window as any).showSaveFilePicker) {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: "cost-report.png",
            types: [
              {
                description: "PNG Image",
                accept: { "image/png": [".png"] },
              },
            ],
          });
          const stream = await handle.createWritable();
          await stream.write(blob);
          await stream.close();
        } else {
          throw new Error("File System Access API not supported");
        }
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;

        const croppedDataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = croppedDataUrl;
        link.download = "cost-report.png";
        link.click();
      }

      setCaptureFraming(false);
      setDocumentFrameSize(DEFAULT_COST_REPORT_CAPTURE.documentFrameSize);
      setPreviewZoom(DEFAULT_COST_REPORT_CAPTURE.previewZoom);
      setFrameOffsetX(DEFAULT_COST_REPORT_CAPTURE.frameOffsetX);
      setFrameOffsetY(DEFAULT_COST_REPORT_CAPTURE.frameOffsetY);
    } catch (e) {
      setExportImageError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setHideCaptureOverlay(false);
      setExportingImage(false);
    }
  };

  const isLoading = projectLoading || listLoading;

  const previewPanelProps = {
    html: editorHtml,
    fileId: selectedFileId,
    captureFraming,
    hideCaptureOverlay,
    documentFrameSize,
    onDocumentFrameSizeChange: setDocumentFrameSize,
    previewZoom,
    onPreviewZoomChange: setPreviewZoom,
    frameOffsetX,
    frameOffsetY,
    onFrameOffsetXChange: setFrameOffsetX,
    onFrameOffsetYChange: setFrameOffsetY,
    onCancelCapture: cancelCapture,
    onConfirmCapture: () => void confirmCaptureToFile(),
    exportingImage,
  };

  return (
    <div className="flex min-h-full flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="shrink-0 px-5 pb-2 pt-5 md:px-7 md:pt-6">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Cost report
        </h1>
      </div>

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
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 md:px-7 md:pb-6">
          <div className="mb-2 flex h-10 shrink-0 items-center gap-2">
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
              <button
                type="button"
                onClick={beginSaveImageFlow}
                disabled={
                  exportingImage ||
                  contentLoading ||
                  editorHtml.length === 0 ||
                  captureFraming
                }
                title="Frame the preview, then save a PNG to your computer"
                className="flex h-7 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 transition enabled:hover:border-gray-300 enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:enabled:hover:border-gray-600 dark:enabled:hover:bg-gray-800"
              >
                <PhotoIcon className="h-3.5 w-3.5 shrink-0" />
                {exportingImage ? "Saving…" : "Save image"}
              </button>

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

          {saveError ? (
            <div className="mb-2 shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {saveError}
            </div>
          ) : null}
          {exportImageError ? (
            <div className="mb-2 shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {exportImageError}
            </div>
          ) : null}

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
              right={<PreviewPanel {...previewPanelProps} className="rounded-xl border border-gray-200 dark:border-gray-800" />}
            />
          ) : activeTab === "code" ? (
            <CodePanel
              value={editorHtml}
              onChange={setEditorHtml}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-800"
            />
          ) : (
            <PreviewPanel
              {...previewPanelProps}
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

type PreviewPanelProps = {
  html: string;
  fileId: string | null;
  className?: string;
  captureFraming: boolean;
  hideCaptureOverlay: boolean;
  documentFrameSize: number;
  onDocumentFrameSizeChange: (n: number) => void;
  previewZoom: number;
  onPreviewZoomChange: (n: number) => void;
  frameOffsetX: number;
  frameOffsetY: number;
  onFrameOffsetXChange: Dispatch<SetStateAction<number>>;
  onFrameOffsetYChange: Dispatch<SetStateAction<number>>;
  onCancelCapture: () => void;
  onConfirmCapture: () => void;
  exportingImage: boolean;
};

function PreviewPanel({
  html,
  fileId,
  className = "",
  captureFraming,
  hideCaptureOverlay,
  documentFrameSize,
  onDocumentFrameSizeChange,
  previewZoom,
  onPreviewZoomChange,
  frameOffsetX,
  frameOffsetY,
  onFrameOffsetXChange,
  onFrameOffsetYChange,
  onCancelCapture,
  onConfirmCapture,
  exportingImage,
}: PreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [scrollSize, setScrollSize] = useState({ w: 0, h: 0 });

  const syncScrollSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollSize({ w: el.scrollWidth, h: el.scrollHeight });
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
      setScrollSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    applyPreviewZoomToIframe(iframe, captureFraming, previewZoom);
    fitCostReportPreviewIframe(iframe, syncScrollSize);
  }, [html, containerSize, previewZoom, captureFraming, syncScrollSize]);

  useEffect(() => {
    const w = scrollSize.w;
    const h = scrollSize.h;
    if (w < 4 || h < 4) return;
    const { docWidth, docHeight } = getCostReportFrameDimensions(
      w,
      h,
      documentFrameSize,
    );
    const maxOffsetX = Math.max(0, (w - docWidth) / 2);
    const maxOffsetY = Math.max(0, (h - docHeight) / 2);
    onFrameOffsetXChange((prev) =>
      Math.min(Math.max(prev, -maxOffsetX), maxOffsetX),
    );
    onFrameOffsetYChange((prev) =>
      Math.min(Math.max(prev, -maxOffsetY), maxOffsetY),
    );
  }, [
    scrollSize.w,
    scrollSize.h,
    documentFrameSize,
    onFrameOffsetXChange,
    onFrameOffsetYChange,
  ]);

  const frameStyle = useMemo(() => {
    const w = scrollSize.w;
    const h = scrollSize.h;
    if (w < 4 || h < 4) return { left: 0, top: 0, width: 0, height: 0 };
    const { x, y, docWidth, docHeight } = getCostReportFrameRect(
      w,
      h,
      documentFrameSize,
      frameOffsetX,
      frameOffsetY,
    );
    return { left: x, top: y, width: docWidth, height: docHeight };
  }, [
    scrollSize.w,
    scrollSize.h,
    documentFrameSize,
    frameOffsetX,
    frameOffsetY,
  ]);

  const frameOffsetBounds = useMemo(() => {
    const w = scrollSize.w;
    const h = scrollSize.h;
    if (w < 4 || h < 4) {
      return { maxOffsetX: 0, maxOffsetY: 0 };
    }
    const { docWidth, docHeight } = getCostReportFrameDimensions(
      w,
      h,
      documentFrameSize,
    );
    return {
      maxOffsetX: Math.max(0, (w - docWidth) / 2),
      maxOffsetY: Math.max(0, (h - docHeight) / 2),
    };
  }, [scrollSize.w, scrollSize.h, documentFrameSize]);

  const nudgeFrame = useCallback(
    (dx: number, dy: number) => {
      const { maxOffsetX, maxOffsetY } = frameOffsetBounds;
      if (dx !== 0) {
        onFrameOffsetXChange((prev) => {
          const next = prev + dx;
          return Math.min(Math.max(next, -maxOffsetX), maxOffsetX);
        });
      }
      if (dy !== 0) {
        onFrameOffsetYChange((prev) => {
          const next = prev + dy;
          return Math.min(Math.max(next, -maxOffsetY), maxOffsetY);
        });
      }
    },
    [frameOffsetBounds, onFrameOffsetXChange, onFrameOffsetYChange],
  );

  const fitPreviewToFrame = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.documentElement || frameStyle.width < 8 || frameStyle.height < 8) {
      return;
    }
    const doc = iframe.contentDocument;
    const htmlEl = doc.documentElement;
    htmlEl.style.zoom = "";
    void iframe.offsetWidth;
    const w = Math.max(doc.body?.scrollWidth ?? 0, htmlEl.scrollWidth, 1);
    const h = Math.max(doc.body?.scrollHeight ?? 0, htmlEl.scrollHeight, 1);
    const z = Math.min(frameStyle.width / w, frameStyle.height / h, 1);
    onPreviewZoomChange(Math.round(Math.max(z, 0.05) * 1000) / 1000);
  }, [frameStyle.width, frameStyle.height, onPreviewZoomChange]);

  const showFrameOverlay =
    captureFraming && !hideCaptureOverlay && frameStyle.width > 0;

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-white ${className}`}>
      <div className="flex h-8 shrink-0 items-center border-b border-gray-200 bg-gray-50 px-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Live Preview
        </span>
      </div>

      <div
        ref={containerRef}
        id="cost-report-capture-container"
        className="relative min-h-[280px] w-full flex-1 overflow-auto bg-white"
      >
        <iframe
          ref={iframeRef}
          key={fileId ?? "none"}
          title="Cost report preview"
          srcDoc={html}
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="block min-h-full w-full border-0 bg-white"
          onLoad={() => {
            const iframe = iframeRef.current;
            if (!iframe) return;
            applyPreviewZoomToIframe(iframe, captureFraming, previewZoom);
            fitCostReportPreviewIframe(iframe, syncScrollSize);
          }}
        />
        {showFrameOverlay ? (
          <>
            <div
              className="pointer-events-none absolute inset-0 z-10 bg-black/25"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute z-20 border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.2)]"
              style={{
                left: frameStyle.left,
                top: frameStyle.top,
                width: frameStyle.width,
                height: frameStyle.height,
              }}
            />
          </>
        ) : null}
      </div>

      {captureFraming ? (
        <div className="shrink-0 space-y-2 border-t border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/80">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Resize the letter frame, zoom, and move the frame so the crop matches what you want, then save. Press Esc to cancel.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <span className="w-20 shrink-0">Frame size</span>
              <input
                type="range"
                min={0.25}
                max={1}
                step={0.02}
                value={documentFrameSize}
                onChange={(e) => onDocumentFrameSizeChange(Number(e.target.value))}
                className="min-w-0 flex-1"
              />
              <span className="w-10 shrink-0 tabular-nums">{documentFrameSize.toFixed(2)}</span>
            </label>
            <label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <span className="w-20 shrink-0">Zoom</span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={previewZoom}
                onChange={(e) => onPreviewZoomChange(Number(e.target.value))}
                className="min-w-0 flex-1"
              />
              <span className="w-12 shrink-0 tabular-nums">{Math.round(previewZoom * 100)}%</span>
            </label>
            <button
              type="button"
              onClick={fitPreviewToFrame}
              disabled={exportingImage || frameStyle.width < 8}
              className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Fit to frame
            </button>
            <div className="flex items-center gap-2 sm:ml-auto">
              <button
                type="button"
                onClick={onCancelCapture}
                disabled={exportingImage}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmCapture}
                disabled={exportingImage}
                className="rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {exportingImage ? "Saving…" : "Save image"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-gray-200 pt-2 dark:border-gray-700">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
              Frame position
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                <span className="w-20 shrink-0">Horizontal</span>
                <input
                  type="range"
                  min={-frameOffsetBounds.maxOffsetX}
                  max={frameOffsetBounds.maxOffsetX}
                  step={1}
                  value={frameOffsetBounds.maxOffsetX <= 0 ? 0 : frameOffsetX}
                  disabled={exportingImage || frameOffsetBounds.maxOffsetX <= 0}
                  onChange={(e) => onFrameOffsetXChange(Number(e.target.value))}
                  className="min-w-0 flex-1 disabled:opacity-40"
                  aria-label="Move frame horizontally"
                />
                <span className="w-14 shrink-0 tabular-nums">
                  {frameOffsetBounds.maxOffsetX <= 0 ? "—" : `${Math.round(frameOffsetX)}px`}
                </span>
              </label>
              <label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                <span className="w-20 shrink-0">Vertical</span>
                <input
                  type="range"
                  min={-frameOffsetBounds.maxOffsetY}
                  max={frameOffsetBounds.maxOffsetY}
                  step={1}
                  value={frameOffsetBounds.maxOffsetY <= 0 ? 0 : frameOffsetY}
                  disabled={exportingImage || frameOffsetBounds.maxOffsetY <= 0}
                  onChange={(e) => onFrameOffsetYChange(Number(e.target.value))}
                  className="min-w-0 flex-1 disabled:opacity-40"
                  aria-label="Move frame vertically"
                />
                <span className="w-14 shrink-0 tabular-nums">
                  {frameOffsetBounds.maxOffsetY <= 0 ? "—" : `${Math.round(frameOffsetY)}px`}
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="sr-only">Nudge frame</span>
                <div className="inline-grid grid-cols-2 gap-0.5 rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-900">
                  <span className="col-span-2 flex justify-center">
                    <button
                      type="button"
                      disabled={exportingImage || frameOffsetBounds.maxOffsetY <= 0}
                      onClick={() => nudgeFrame(0, -10)}
                      className="flex h-7 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                      aria-label="Move frame up"
                    >
                      <ArrowUpIcon className="h-4 w-4" />
                    </button>
                  </span>
                  <button
                    type="button"
                    disabled={exportingImage || frameOffsetBounds.maxOffsetX <= 0}
                    onClick={() => nudgeFrame(-10, 0)}
                    className="flex h-7 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                    aria-label="Move frame left"
                  >
                    <ArrowLeftIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={exportingImage || frameOffsetBounds.maxOffsetX <= 0}
                    onClick={() => nudgeFrame(10, 0)}
                    className="flex h-7 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                    aria-label="Move frame right"
                  >
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                  <span className="col-span-2 flex justify-center">
                    <button
                      type="button"
                      disabled={exportingImage || frameOffsetBounds.maxOffsetY <= 0}
                      onClick={() => nudgeFrame(0, 10)}
                      className="flex h-7 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                      aria-label="Move frame down"
                    >
                      <ArrowDownIcon className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <button
                  type="button"
                  disabled={exportingImage}
                  onClick={() => {
                    onFrameOffsetXChange(0);
                    onFrameOffsetYChange(0);
                  }}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  title="Center frame in preview"
                >
                  Reset position
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
