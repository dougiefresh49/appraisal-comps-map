"use client";

import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { XMarkIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";

/** Clamp n to [min, max]. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

interface FolderStructure {
  subjectSketchesFolderId?: string;
  [key: string]: unknown;
}

interface DriveListFile {
  id: string;
  name: string;
  mimeType: string;
}

interface SubjectSketchesPageProps {
  params: Promise<{ projectId: string }>;
}

function isImageFile(f: DriveListFile): boolean {
  return f.mimeType.startsWith("image/");
}

function SketchThumbnailCard({
  file,
  onOpen,
}: {
  file: DriveListFile;
  onOpen: () => void;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const thumbUrl = `/api/drive/thumbnail/${file.id}?sz=1024`;

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onOpen}
      className="group relative flex min-h-[min(52vw,420px)] w-full flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 text-left transition hover:border-gray-600 hover:ring-2 hover:ring-blue-600/40 focus:ring-2 focus:ring-blue-500 focus:outline-none sm:min-h-[320px]"
    >
      <div className="relative min-h-[200px] flex-1 bg-gray-950/80 sm:min-h-[260px]">
        {shouldLoad ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbUrl}
            alt={file.name}
            className="h-full max-h-[min(56vh,520px)] w-full object-contain object-center transition group-hover:opacity-95 sm:max-h-[480px]"
            loading="lazy"
          />
        ) : (
          <div
            className="h-full min-h-[200px] w-full animate-pulse bg-gray-800/90 sm:min-h-[260px]"
            aria-hidden
          />
        )}
      </div>
      <span className="truncate border-t border-gray-800/80 bg-gray-950/90 px-3 py-2 text-left text-xs text-gray-400">
        {file.name}
      </span>
    </button>
  );
}

function SketchPreviewLightbox({
  fileId,
  fileName,
  onClose,
}: {
  fileId: string;
  fileName: string;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [userScale, setUserScale] = useState(1);
  const userScaleRef = useRef(1);
  userScaleRef.current = userScale;
  const pinchRef = useRef<{ startDist: number; startUserScale: number } | null>(
    null,
  );

  const imageSrc = `/api/drive/file/${fileId}`;

  useLayoutEffect(() => {
    setNatural(null);
    setUserScale(1);
    setFitScale(1);
  }, [fileId]);

  useLayoutEffect(() => {
    if (!natural || !scrollRef.current) return;
    const el = scrollRef.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const pad = 20;
      const cw = Math.max(1, r.width - pad);
      const ch = Math.max(1, r.height - pad);
      const s = Math.min(cw / natural.w, ch / natural.h, 1);
      setFitScale(Math.max(s, 0.001));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natural, fileId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, [fileId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      if (t0 === undefined || t1 === undefined) return;
      pinchRef.current = {
        startDist: touchDistance(t0, t1),
        startUserScale: userScaleRef.current,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      if (t0 === undefined || t1 === undefined) return;
      e.preventDefault();
      const d = touchDistance(t0, t1);
      const ratio = d / pinchRef.current.startDist;
      setUserScale(
        clamp(pinchRef.current.startUserScale * ratio, 0.35, 12),
      );
    };

    const endPinch = () => {
      pinchRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", endPinch);
    el.addEventListener("touchcancel", endPinch);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", endPinch);
      el.removeEventListener("touchcancel", endPinch);
    };
  }, [fileId]);

  const combined =
    natural !== null ? Math.max(fitScale * userScale, 0.001) : undefined;
  const pixW = natural && combined !== undefined ? Math.round(natural.w * combined) : undefined;
  const pixH = natural && combined !== undefined ? Math.round(natural.h * combined) : undefined;

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = delta > 0 ? 0.92 : 1.08;
    setUserScale((s) => clamp(s * factor, 0.35, 12));
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <span
        className="flex h-[min(92vh,900px)] w-full max-w-[min(96vw,1280px)] flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-800 px-4 py-2">
          <span className="min-w-0 truncate text-sm font-medium text-gray-200">
            {fileName}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-gray-100"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-gray-950/90 p-3"
          onWheel={onWheel}
        >
          <div className="flex min-h-full min-w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={fileName}
              width={pixW}
              height={pixH}
              className={
                natural
                  ? "inline-block max-w-none bg-white shadow-lg"
                  : "max-h-[calc(92vh-8rem)] w-auto max-w-full object-contain shadow-lg"
              }
              onLoad={(e) => {
                const img = e.currentTarget;
                setNatural({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              onDoubleClick={() => setUserScale(1)}
            />
          </div>
        </div>
        <p className="shrink-0 border-t border-gray-800 px-4 py-2 text-center text-[11px] text-gray-500">
          Ctrl+scroll or pinch to zoom · double-click resets · Esc to close
        </p>
      </span>
    </div>
  );
}

export default function SubjectSketchesPage({ params }: SubjectSketchesPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);

  const { project, isLoading: projectLoading } = useProject(decodedProjectId);

  const [files, setFiles] = useState<DriveListFile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string>("");

  const raw = project as unknown as Record<string, unknown> | undefined;
  const folderStructure = (raw?.folderStructure ??
    raw?.folder_structure) as FolderStructure | undefined;
  const sketchesFolderId = folderStructure?.subjectSketchesFolderId;

  const loadFiles = useCallback(async () => {
    if (!sketchesFolderId) {
      setFiles([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: sketchesFolderId,
          filesOnly: true,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { files: DriveListFile[] };
      setFiles(data.files ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load sketches");
      setFiles([]);
    } finally {
      setListLoading(false);
    }
  }, [sketchesFolderId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!lightboxId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxId]);

  const images = files.filter(isImageFile);

  const openLightbox = (file: DriveListFile) => {
    setLightboxId(file.id);
    setLightboxName(file.name);
  };

  return (
    <div className="min-h-full bg-gray-950 p-6 text-gray-100 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Subject sketches</h1>
          <p className="mt-1 text-sm text-gray-400">
            Images from the subject/sketches folder in Drive.
          </p>
        </div>

        {projectLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
          </div>
        ) : !sketchesFolderId ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-16 text-center">
            <PhotoIcon className="mx-auto h-12 w-12 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">
              No sketches folder is linked for this project. Complete project setup
              or link a Drive folder that includes{" "}
              <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-300">
                subject/sketches
              </code>
              .
            </p>
          </div>
        ) : listLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
          </div>
        ) : listError ? (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {listError}
          </div>
        ) : images.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-16 text-center">
            <PhotoIcon className="mx-auto h-12 w-12 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">No images in this folder.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
            {images.map((file) => (
              <SketchThumbnailCard
                key={file.id}
                file={file}
                onOpen={() => openLightbox(file)}
              />
            ))}
          </div>
        )}
      </div>

      {lightboxId && (
        <SketchPreviewLightbox
          fileId={lightboxId}
          fileName={lightboxName}
          onClose={() => setLightboxId(null)}
        />
      )}
    </div>
  );
}
