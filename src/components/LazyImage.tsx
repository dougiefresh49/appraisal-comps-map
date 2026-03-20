"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  delay?: number; // Stagger delay in milliseconds
  width?: number;
  height?: number;
}

export function LazyImage({
  src,
  alt,
  className = "",
  delay = 0,
  width,
  height,
}: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isLoadedRef = useRef(false);

  const maxRetries = 3;
  const baseRetryDelay = 2000; // 2 second base delay for rate limiting

  /* eslint-disable react-hooks/exhaustive-deps */
  const loadImage = async (url: string, retry = 0) => {
    // Add delay for staggered loading on first attempt
    if (delay > 0 && retry === 0 && !isLoadedRef.current) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // For retries, add exponential backoff
    if (retry > 0) {
      const retryDelay = baseRetryDelay * Math.pow(2, retry - 1);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    // Set the image source - Next.js Image will handle loading
    // Error handling is done via onError handler
    setImageSrc(url);
    setError(false);
    isLoadedRef.current = true;
  };

  const handleImageError = () => {
    if (retryCount < maxRetries && !isLoadedRef.current) {
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      // Retry loading with exponential backoff
      const retryDelay = baseRetryDelay * Math.pow(2, newRetryCount - 1);
      setTimeout(() => {
        void loadImage(src, newRetryCount);
      }, retryDelay);
    } else {
      setError(true);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || isLoadedRef.current) return;

    // Create Intersection Observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (
            entry.isIntersecting &&
            !imageSrc &&
            !error &&
            !isLoadedRef.current
          ) {
            void loadImage(src, retryCount);
            observerRef.current?.unobserve(container);
          }
        });
      },
      {
        rootMargin: "100px", // Start loading well before image enters viewport
      },
    );

    observerRef.current.observe(container);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [src, delay]); // Keep existing deps logic as this effect starts the observer

  // Retry on error with updated retry count
  useEffect(() => {
    if (error && retryCount < maxRetries && !isLoadedRef.current) {
      const retryDelay = baseRetryDelay * Math.pow(2, retryCount);
      const timeoutId = setTimeout(() => {
        setError(false);
        void loadImage(src, retryCount);
      }, retryDelay);
      return () => clearTimeout(timeoutId);
    }
  }, [error, retryCount, src]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Use fill for aspect ratio container, or provided width/height
  const useFill = !width || !height;

  return (
    <div
      ref={containerRef}
      className={`relative ${useFill ? "h-full w-full" : ""} ${className}`}
    >
      {!imageSrc && !error && (
        <div className="absolute inset-0 animate-pulse bg-gray-200" />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400">
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
          onError={handleImageError}
          unoptimized={true} // Disable Next.js optimization for external Google Drive images to avoid issues
          loading="lazy"
        />
      )}
      {/* Invisible placeholder to maintain aspect ratio and enable intersection observer */}
      {!imageSrc && (
        <div className="absolute inset-0 opacity-0" aria-hidden="true" />
      )}
    </div>
  );
}
