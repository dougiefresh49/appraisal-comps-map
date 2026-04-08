"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export function ImageZoomLightbox({
  imageSrc,
  title,
  onClose,
}: {
  imageSrc: string;
  title: string;
  onClose: () => void;
}) {
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

  useLayoutEffect(() => {
    setNatural(null);
    setUserScale(1);
    setFitScale(1);
  }, [imageSrc]);

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
  }, [natural, imageSrc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, [imageSrc]);

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
  }, [imageSrc]);

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
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = delta > 0 ? 0.92 : 1.08;
    setUserScale((s) => clamp(s * factor, 0.35, 12));
  };

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
        className="relative z-[1] flex h-[min(92vh,900px)] w-full max-w-[min(96vw,1280px)] flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-800 px-4 py-2">
          <span className="min-w-0 truncate text-sm font-medium text-gray-200">
            {title}
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
        </div>
        <p className="shrink-0 border-t border-gray-800 px-4 py-2 text-center text-[11px] text-gray-500">
          Ctrl+scroll or pinch to zoom · double-click resets · Esc to close
        </p>
      </span>
    </div>
  );
}
