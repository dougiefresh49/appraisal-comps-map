"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { thumbnailQueue } from "~/utils/thumbnail-queue";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}

const maxRetries = 3;
const baseRetryDelayMs = 2000;

export function LazyImage({
  src,
  alt,
  className = "",
  width,
  height,
}: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showBroken, setShowBroken] = useState(false);

  const mountedRef = useRef(true);
  const slotHeldRef = useRef(false);
  /** True from startLoad entry until onLoad/onError or reset (prevents duplicate concurrent loads). */
  const sessionActiveRef = useRef(false);
  const completedRef = useRef(false);
  const retryCountRef = useRef(0);
  const loadGenerationRef = useRef(0);

  const imageSrcRef = useRef<string | null>(null);
  const showBrokenRef = useRef(false);
  showBrokenRef.current = showBroken;

  const containerRef = useRef<HTMLDivElement>(null);
  const startLoadRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const releaseSlotIfHeld = useCallback(() => {
    if (slotHeldRef.current) {
      slotHeldRef.current = false;
      thumbnailQueue.release();
    }
  }, []);

  const clearSession = useCallback(() => {
    sessionActiveRef.current = false;
  }, []);

  const startLoad = useCallback(async () => {
    if (
      sessionActiveRef.current ||
      completedRef.current ||
      showBrokenRef.current
    ) {
      return;
    }
    sessionActiveRef.current = true;

    const generation = ++loadGenerationRef.current;

    if (retryCountRef.current > 0) {
      const retryDelay =
        baseRetryDelayMs * Math.pow(2, retryCountRef.current - 1);
      await new Promise((r) => setTimeout(r, retryDelay));
      if (!mountedRef.current || generation !== loadGenerationRef.current) {
        clearSession();
        return;
      }
    }

    await thumbnailQueue.acquire();

    if (!mountedRef.current || generation !== loadGenerationRef.current) {
      thumbnailQueue.release();
      clearSession();
      return;
    }

    slotHeldRef.current = true;
    imageSrcRef.current = src;
    setImageSrc(src);
  }, [src, clearSession]);

  startLoadRef.current = startLoad;

  const handleLoad = useCallback(() => {
    completedRef.current = true;
    releaseSlotIfHeld();
    thumbnailQueue.recordSuccess();
    retryCountRef.current = 0;
    clearSession();
  }, [releaseSlotIfHeld, clearSession]);

  const handleError = useCallback(() => {
    releaseSlotIfHeld();
    void thumbnailQueue.recordLoadError();

    imageSrcRef.current = null;
    setImageSrc(null);
    clearSession();

    retryCountRef.current += 1;
    if (retryCountRef.current <= maxRetries) {
      void startLoad();
    } else {
      setShowBroken(true);
    }
  }, [releaseSlotIfHeld, clearSession, startLoad]);

  /* Reset when URL changes */
  useEffect(() => {
    releaseSlotIfHeld();
    clearSession();
    imageSrcRef.current = null;
    setImageSrc(null);
    setShowBroken(false);
    completedRef.current = false;
    retryCountRef.current = 0;
    loadGenerationRef.current = 0;
  }, [src, releaseSlotIfHeld, clearSession]);

  useEffect(() => {
    mountedRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (completedRef.current || showBrokenRef.current) return;
        if (imageSrcRef.current) return;
        void startLoadRef.current();
      },
      { rootMargin: "200px" },
    );

    observer.observe(container);

    return () => {
      mountedRef.current = false;
      observer.disconnect();
      if (slotHeldRef.current) {
        slotHeldRef.current = false;
        thumbnailQueue.release();
      }
      sessionActiveRef.current = false;
    };
  }, [src]);

  const useFill = !width || !height;

  return (
    <div
      ref={containerRef}
      className={`relative ${useFill ? "h-full w-full" : ""} ${className}`}
    >
      {!imageSrc && !showBroken && (
        <div className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700" />
      )}
      {showBroken && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
      {imageSrc && (
        <Image
          src={imageSrc}
          alt={alt}
          fill={useFill}
          width={useFill ? undefined : width}
          height={useFill ? undefined : height}
          className={`${className} object-cover`}
          onLoad={handleLoad}
          onError={handleError}
          unoptimized={true}
          loading="lazy"
        />
      )}
      {!imageSrc && (
        <div className="absolute inset-0 opacity-0" aria-hidden="true" />
      )}
    </div>
  );
}
