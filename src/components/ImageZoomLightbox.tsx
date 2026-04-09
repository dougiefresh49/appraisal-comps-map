"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { driveFetch } from "~/lib/drive-fetch";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

type PreviewKind = "image" | "pdf" | "embed";

function isAppDriveProxyUrl(url: string): boolean {
  return url.includes("/api/drive/");
}

function previewKindFromFileName(
  fileName: string | null | undefined,
): PreviewKind {
  const n = fileName?.toLowerCase() ?? "";
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.exec(n)) return "image";
  return "embed";
}

export function ImageZoomLightbox({
  imageSrc,
  title,
  onClose,
  /** When omitted, image zoom mode is used (maps, sketches). */
  fileName,
  /** Shown in header when provided (e.g. open native Drive tab). */
  externalViewerUrl,
}: {
  imageSrc: string;
  title: string;
  onClose: () => void;
  fileName?: string | null;
  externalViewerUrl?: string | null;
}) {
  const kind =
    fileName === undefined || fileName === null
      ? "image"
      : previewKindFromFileName(fileName);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [fitScale, setFitScale] = useState(1);
  const [userScale, setUserScale] = useState(1);
  const userScaleRef = useRef(1);
  userScaleRef.current = userScale;
  const pinchRef = useRef<{
    startDist: number;
    startUserScale: number;
  } | null>(null);

  const [proxiedSrc, setProxiedSrc] = useState<string | null>(null);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [proxyLoading, setProxyLoading] = useState(false);
  const proxiedObjectUrlRef = useRef<string | null>(null);

  const needsProxiedLoad = isAppDriveProxyUrl(imageSrc);
  const displaySrc = needsProxiedLoad ? (proxiedSrc ?? "") : imageSrc;

  useLayoutEffect(() => {
    setNatural(null);
    setUserScale(1);
    setFitScale(1);
  }, [imageSrc, kind]);

  useEffect(() => {
    if (!needsProxiedLoad) {
      setProxiedSrc(null);
      setProxyError(null);
      setProxyLoading(false);
      return;
    }

    let cancelled = false;
    setProxyLoading(true);
    setProxyError(null);
    setProxiedSrc(null);

    if (proxiedObjectUrlRef.current) {
      URL.revokeObjectURL(proxiedObjectUrlRef.current);
      proxiedObjectUrlRef.current = null;
    }

    void (async () => {
      try {
        const res = await driveFetch(imageSrc);
        if (cancelled) return;
        if (!res.ok) {
          let message = `Could not load preview (${res.status})`;
          try {
            const j = (await res.json()) as { error?: string };
            if (j.error) message = j.error;
          } catch {
            /* use default */
          }
          setProxyError(message);
          setProxyLoading(false);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        proxiedObjectUrlRef.current = objectUrl;
        setProxiedSrc(objectUrl);
      } catch {
        if (!cancelled) {
          setProxyError("Failed to load preview");
        }
      } finally {
        if (!cancelled) setProxyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageSrc, needsProxiedLoad]);

  useEffect(() => {
    return () => {
      if (proxiedObjectUrlRef.current) {
        URL.revokeObjectURL(proxiedObjectUrlRef.current);
        proxiedObjectUrlRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (kind !== "image" || !natural || !scrollRef.current) return;
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
  }, [natural, displaySrc, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (kind !== "image") return;
    const el = scrollRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, [displaySrc, kind]);

  useEffect(() => {
    if (kind !== "image") return;
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
  }, [displaySrc, kind]);

  const combined =
    natural !== null ? Math.max(fitScale * userScale, 0.001) : undefined;
  const pixW =
    natural && combined !== undefined
      ? Math.round(natural.w * combined)
      : undefined;
  const pixH =
    natural && combined !== undefined
      ? Math.round(natural.h * combined)
      : undefined;

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (kind !== "image") return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = delta > 0 ? 0.92 : 1.08;
    setUserScale((s) => clamp(s * factor, 0.35, 12));
  };

  const footerHint =
    kind === "image"
      ? "Ctrl+scroll or pinch to zoom · double-click resets · Esc to close"
      : "Esc to close · use “Open in Drive” if preview does not load";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} full size`}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 z-0 cursor-default"
        aria-label="Close lightbox"
      />
      <span
        className="relative z-[1] flex h-[min(92vh,900px)] w-full max-w-[min(96vw,1280px)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
          <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-200">
            {title}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {externalViewerUrl ? (
              <a
                href={externalViewerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-gray-800"
              >
                Open in Drive
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-gray-100 p-3 dark:bg-gray-950/90"
          onWheel={onWheel}
        >
          {needsProxiedLoad && proxyLoading ? (
            <div className="flex h-[min(85vh,860px)] items-center justify-center text-sm text-gray-600 dark:text-gray-400">
              Loading preview…
            </div>
          ) : needsProxiedLoad && proxyError ? (
            <div className="flex h-[min(85vh,860px)] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">
                {proxyError}
              </p>
              {externalViewerUrl ? (
                <a
                  href={externalViewerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 dark:text-blue-400"
                >
                  Open in Drive
                </a>
              ) : null}
            </div>
          ) : kind === "image" ? (
            <div className="flex min-h-full min-w-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displaySrc}
                alt={title}
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
          ) : kind === "pdf" ? (
            <iframe
              title={title}
              src={displaySrc}
              className="h-[min(85vh,860px)] w-full rounded-lg border border-gray-200 bg-white dark:border-gray-700"
            />
          ) : (
            <div className="flex h-[min(85vh,860px)] flex-col">
              <iframe
                title={title}
                src={displaySrc}
                className="min-h-0 flex-1 w-full rounded-lg border border-gray-200 bg-white dark:border-gray-700"
              />
              <p className="mt-2 text-center text-xs text-gray-600 dark:text-gray-400">
                If this file does not display, use Open in Drive.
              </p>
            </div>
          )}
        </div>
        <p className="shrink-0 border-t border-gray-200 px-4 py-2 text-center text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-500">
          {footerHint}
        </p>
      </span>
    </div>
  );
}
