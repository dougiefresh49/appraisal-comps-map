"use client";

import { useEffect, useRef, useState } from "react";

interface DocumentOverlayProps {
  enabled: boolean;
  size?: number; // Scale factor (defaults to 1.0)
}

/**
 * DocumentOverlay shows an 8.5x11 inch document frame overlay on the map
 * to help users understand if their screenshot will fit on a Google document page.
 * Similar to Mac screenshot tool - darkens the area outside the document frame.
 */
export function DocumentOverlay({ enabled, size = 1.0 }: DocumentOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
    containerWidth: 0,
    containerHeight: 0,
  });

  useEffect(() => {
    if (!enabled) {
      setDimensions({ width: 0, height: 0, containerWidth: 0, containerHeight: 0 });
      return;
    }

    // Use a small delay to ensure the ref is mounted
    const updateDimensions = () => {
      if (!overlayRef.current) return;

      const container = overlayRef.current.parentElement;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      if (containerWidth === 0 || containerHeight === 0) return;

      // 8.5x11 inch aspect ratio
      const documentAspectRatio = 8.5 / 11; // ≈ 0.7727

      // Calculate document frame size to fit within container
      // Apply the size multiplier
      let docWidth = containerWidth * 0.9 * size;
      let docHeight = docWidth / documentAspectRatio;

      // If height exceeds container, fit by height instead
      if (docHeight > containerHeight * 0.9 * size) {
        docHeight = containerHeight * 0.9 * size;
        docWidth = docHeight * documentAspectRatio;
      }

      setDimensions({
        width: docWidth,
        height: docHeight,
        containerWidth,
        containerHeight,
      });
    };

    // Use requestAnimationFrame to ensure DOM is ready
    let rafId: number;
    let retryCount = 0;
    const maxRetries = 10;
    
    const scheduleUpdate = () => {
      rafId = requestAnimationFrame(() => {
        if (!overlayRef.current) {
          if (retryCount < maxRetries) {
            retryCount++;
            scheduleUpdate();
          }
          return;
        }
        
        const container = overlayRef.current.parentElement;
        if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
          if (retryCount < maxRetries) {
            retryCount++;
            scheduleUpdate();
          }
          return;
        }
        
        updateDimensions();
      });
    };
    
    scheduleUpdate();
    window.addEventListener("resize", updateDimensions);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateDimensions);
    };
  }, [enabled, size]);

  if (!enabled) return null;

  // Don't render content until dimensions are calculated
  if (dimensions.width === 0 || dimensions.height === 0) {
    return (
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-50"
      />
    );
  }

  const { containerWidth, containerHeight } = dimensions;

  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;
  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;

  // Calculate positions for the four darkened rectangles
  const topHeight = centerY - halfHeight;
  const bottomTop = centerY + halfHeight;
  const bottomHeight = containerHeight - bottomTop;
  const leftWidth = centerX - halfWidth;
  const rightLeft = centerX + halfWidth;
  const rightWidth = containerWidth - rightLeft;

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-50"
    >
      {/* Top darkened area */}
      {topHeight > 0 && (
        <div
          className="absolute left-0 bg-black/60"
          style={{
            top: 0,
            width: "100%",
            height: `${topHeight}px`,
          }}
        />
      )}

      {/* Bottom darkened area */}
      {bottomHeight > 0 && (
        <div
          className="absolute left-0 bg-black/60"
          style={{
            top: `${bottomTop}px`,
            width: "100%",
            height: `${bottomHeight}px`,
          }}
        />
      )}

      {/* Left darkened area */}
      {leftWidth > 0 && (
        <div
          className="absolute bg-black/60"
          style={{
            left: 0,
            top: `${topHeight}px`,
            width: `${leftWidth}px`,
            height: `${dimensions.height}px`,
          }}
        />
      )}

      {/* Right darkened area */}
      {rightWidth > 0 && (
        <div
          className="absolute bg-black/60"
          style={{
            left: `${rightLeft}px`,
            top: `${topHeight}px`,
            width: `${rightWidth}px`,
            height: `${dimensions.height}px`,
          }}
        />
      )}

      {/* Document frame border - rendered on top */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.2)",
        }}
      >
        {/* Size label */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-white drop-shadow-lg">
          {Math.round(dimensions.width)}px × {Math.round(dimensions.height)}px ({Math.round(size * 100)}%)
        </div>
      </div>
    </div>
  );
}

