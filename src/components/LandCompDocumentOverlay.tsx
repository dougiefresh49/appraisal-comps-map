"use client";

import { useEffect, useRef, useState } from "react";

interface LandCompDocumentOverlayProps {
  enabled: boolean;
  size: number; // Scale factor (0.5 to 2.0)
  // onSizeChange?: (size: number) => void;
}

/**
 * LandCompDocumentOverlay shows a 1.57:1 aspect ratio document frame overlay
 * for land comparable location maps with size controls.
 */
export function LandCompDocumentOverlay({
  enabled,
  size,
  // onSizeChange,
}: LandCompDocumentOverlayProps) {
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

    const updateDimensions = () => {
      if (!overlayRef.current) return;

      const container = overlayRef.current.parentElement;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      if (containerWidth === 0 || containerHeight === 0) return;

      // 1.57:1 aspect ratio
      const documentAspectRatio = 1.57;

      // Calculate base document frame size to fit within container
      // Try fitting by width first
      let baseWidth = containerWidth * 0.9;
      let baseHeight = baseWidth / documentAspectRatio;

      // If height exceeds container, fit by height instead
      if (baseHeight > containerHeight * 0.9) {
        baseHeight = containerHeight * 0.9;
        baseWidth = baseHeight * documentAspectRatio;
      }

      // Apply size scale factor
      const docWidth = baseWidth * size;
      const docHeight = baseHeight * size;

      // Ensure it doesn't exceed container bounds
      const finalWidth = Math.min(docWidth, containerWidth * 0.95);
      const finalHeight = Math.min(docHeight, containerHeight * 0.95);

      setDimensions({
        width: finalWidth,
        height: finalHeight,
        containerWidth,
        containerHeight,
      });
    };

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

      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.2)",
        }}
      >
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-white drop-shadow-lg">
          1.57:1 ({Math.round(size * 100)}%)
        </div>
      </div>
    </div>
  );
}

