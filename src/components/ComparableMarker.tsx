"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";

interface ComparableInfo {
  address: string;
  addressForDisplay: string;
  distance?: string; // e.g., "0.81 miles SW"
}

interface ComparableMarkerProps {
  position: { lat: number; lng: number };
  markerPosition: { lat: number; lng: number };
  comparableInfo: ComparableInfo;
  comparableNumber: number;
  onPositionChange: (position: { lat: number; lng: number }) => void;
  sizeMultiplier?: number; // 1.0 = 100% (400x200 base)
  isTailPinned?: boolean;
  pinnedTailTipPosition?: { lat: number; lng: number };
  color?: string; // Border and tail color
}

// Base dimensions (reference: 360x160px)
const BASE_WIDTH = 360;
const BASE_HEIGHT = 160;
const BASE_PADDING_X = 28;
const BASE_PADDING_Y = 20;
const BASE_FONT_SIZE_TITLE = 24;
const BASE_FONT_SIZE_TEXT = 18;

// Tail dimensions - wide end at bubble center, narrow end at tip
const TAIL_WIDE_WIDTH = 80; // Width at bubble center (wide end)
const TAIL_NARROW_WIDTH = 10; // Width at tip (narrow end)
const TAIL_DEFAULT_LENGTH = 100; // Default length when not pinned

export function ComparableMarker({
  position,
  markerPosition: _markerPosition,
  comparableInfo,
  comparableNumber,
  onPositionChange,
  sizeMultiplier = 1.0,
  isTailPinned = false,
  pinnedTailTipPosition: _pinnedTailTipPosition,
  color = "#10b981", // Default green
}: ComparableMarkerProps) {
  // Apply size multiplier to base dimensions
  const bubbleWidth = BASE_WIDTH * sizeMultiplier;
  const bubbleHeight = BASE_HEIGHT * sizeMultiplier;

  // Calculate scaled values based on size multiplier
  const paddingX = BASE_PADDING_X * sizeMultiplier;
  const paddingY = BASE_PADDING_Y * sizeMultiplier;
  const fontSizeTitle = BASE_FONT_SIZE_TITLE * sizeMultiplier;
  const fontSizeText = BASE_FONT_SIZE_TEXT * sizeMultiplier;
  const borderRadius = 11.5 * sizeMultiplier;

  // Build content
  const address =
    comparableInfo.addressForDisplay ||
    comparableInfo.address ||
    "Enter address";
  const distance = comparableInfo.distance ?? "";

  // Calculate line spacing
  const lineGap = fontSizeText * 1;

  // When tail is pinned, don't render the tail in SVG - it's handled by PinnedTailOverlay
  const shouldShowTail = !isTailPinned;

  // Calculate tail path - simple rectangle/trapezoid
  // Wide end at bubble center, narrow end pointing down-right by default
  const tailWideWidth = TAIL_WIDE_WIDTH * sizeMultiplier;
  const tailNarrowWidth = TAIL_NARROW_WIDTH * sizeMultiplier;
  const tailLength = TAIL_DEFAULT_LENGTH * sizeMultiplier;

  // Tail attaches to center of bubble (bottom edge)
  const bubbleCenterX = bubbleWidth / 2;
  const bubbleBottomY = bubbleHeight;

  // Wide end (at bubble center)
  const wideLeftX = bubbleCenterX - tailWideWidth / 2;
  const wideRightX = bubbleCenterX + tailWideWidth / 2;
  const wideY = bubbleBottomY;

  // Narrow end (tip) - pointing down-right
  const narrowCenterX = bubbleCenterX + tailLength * 0.5; // Offset to the right
  const narrowLeftX = narrowCenterX - tailNarrowWidth / 2;
  const narrowRightX = narrowCenterX + tailNarrowWidth / 2;
  const narrowY = bubbleBottomY + tailLength;

  // Create trapezoid path: wide end -> narrow end
  const tailPath = `M${wideLeftX} ${wideY} L${wideRightX} ${wideY} L${narrowRightX} ${narrowY} L${narrowLeftX} ${narrowY} Z`;

  // SVG viewBox - only include tail if not pinned
  const viewBoxX = 0;
  const viewBoxY = 0;
  const viewBoxWidth = bubbleWidth;
  const viewBoxHeight = shouldShowTail ? bubbleHeight + tailLength : bubbleHeight;

  return (
    <AdvancedMarker
      position={position}
      draggable
      onDragEnd={(e) => {
        if (e.latLng) {
          onPositionChange({
            lat: e.latLng.lat(),
            lng: e.latLng.lng(),
          });
        }
      }}
    >
      <div
        className="relative cursor-move select-none"
        style={{
          width: `${viewBoxWidth}px`,
          height: `${viewBoxHeight}px`,
        }}
      >
        {/* SVG Bubble with white fill and green border */}
        <svg
          width={viewBoxWidth}
          height={viewBoxHeight}
          viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0"
        >
          {/* Tail - only show when not pinned */}
          {shouldShowTail && (
            <path
              d={tailPath}
              fill={color}
            />
          )}
          {/* Bubble rectangle - white fill */}
          <rect
            x={0.5 * sizeMultiplier}
            y={0.5 * sizeMultiplier}
            width={bubbleWidth - sizeMultiplier}
            height={bubbleHeight - sizeMultiplier}
            rx={borderRadius}
            fill="white"
          />
          {/* Bubble rectangle - border */}
          <rect
            x={0.5 * sizeMultiplier}
            y={0.5 * sizeMultiplier}
            width={bubbleWidth - sizeMultiplier}
            height={bubbleHeight - sizeMultiplier}
            rx={borderRadius}
            stroke={color}
            strokeWidth={8 * sizeMultiplier} // 8px border
            fill="none"
          />
        </svg>

        {/* Content overlay - black text on white background */}
        <div
          className="pointer-events-none absolute flex flex-col text-black"
          style={{
            left: `${paddingX}px`,
            right: `${paddingX}px`,
            top: `${paddingY}px`,
            gap: `${lineGap}px`,
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          {/* Title - centered */}
          <div
            className="text-center font-bold"
            style={{ fontSize: `${fontSizeTitle}px` }}
          >
            Comparable No. {comparableNumber}
          </div>

          {/* Address + Distance */}
          {(address || distance) && (
            <div className="flex flex-col gap-1">
              {address && (
                <div
                  className="font-bold"
                  style={{ fontSize: `${fontSizeText}px` }}
                >
                  {address}
                </div>
              )}
              {distance && (
                <div style={{ fontSize: `${fontSizeText}px`, fontWeight: 400 }}>
                  {distance}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdvancedMarker>
  );
}
