"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { PinnedTailOverlay } from "./PinnedTailOverlay";

interface ComparableInfo {
  address: string;
  distance?: string; // e.g., "0.81 miles SW"
  salePrice?: number;
  closeDate?: string;
  source?: string;
  livingArea?: number;
  siteArea?: number; // In sqft or acres
  actualCapRate?: number;
  pricePerUnit?: number;
}

interface ComparableMarkerProps {
  position: { lat: number; lng: number };
  markerPosition?: { lat: number; lng: number }; // Optional override for marker anchor
  comparableNumber: number;
  comparableInfo: ComparableInfo;
  onPositionChange: (position: { lat: number; lng: number }) => void;
  onClick?: () => void;
  sizeMultiplier?: number; // 1.0 = 100%
  color?: string; // e.g. "#10b981" for emerald-500
  tailDirection?: "left" | "right";
  isTailPinned?: boolean;
  pinnedTailTipPosition?: { lat: number; lng: number };
  readOnly?: boolean;
  /** When true, renders the bubble at reduced opacity to signal a preview state. */
  previewMode?: boolean;
}

// Base dimensions (reference: 360x160px)
const BASE_WIDTH = 360;
const BASE_HEIGHT = 160;
const BASE_PADDING_X = 24;
const BASE_PADDING_Y = 16;
const BASE_FONT_SIZE_TITLE = 24;
const BASE_FONT_SIZE_TEXT = 16;

export function ComparableMarker({
  position,
  comparableNumber,
  comparableInfo,
  onPositionChange,
  onClick,
  sizeMultiplier = 1.0,
  color = "#10b981", // Default emerald-500
  tailDirection = "right",
  isTailPinned = false,
  pinnedTailTipPosition,
  readOnly = false,
  previewMode = false,
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

  // When tail is pinned, don't render the tail in SVG - it's handled by PinnedTailOverlay
  const shouldShowTail = !isTailPinned;

  // Tail dimensions from original SVG (scaled with size multiplier)
  // Original SVG is 438px wide, bubble height is 198px, tail extends from y=195 to y=256
  const originalSvgWidth = 438;
  const originalSvgBubbleHeight = 198;
  const originalTailBaseY = 195.184;
  const originalTailTipY = 256.007;
  const originalTailHeight = originalTailTipY - originalTailBaseY; // ~61px

  // Scale factor based on bubble height (maintaining aspect ratio)
  const heightScale = bubbleHeight / originalSvgBubbleHeight;

  const tailHeight = originalTailHeight * heightScale;
  const tailBaseY = bubbleHeight;
  const tailTipY = bubbleHeight + tailHeight;

  // Original tail fill path coordinates (from SVG): M183.032 256.007L97.0014 195.184L167.97 197.308L183.032 256.007Z
  // Calculate positions relative to left edge
  const tailTipXBase = (183.032 / originalSvgWidth) * bubbleWidth;
  const tailLeftXBase = (97.0014 / originalSvgWidth) * bubbleWidth;
  const tailLeftMidXBase = (167.97 / originalSvgWidth) * bubbleWidth;

  // Original tail stroke path: M98.6449 195.734L167.579 197.797L182.21 254.814L98.6449 195.734Z
  // const tailStrokeLeftXBase = (98.6449 / originalSvgWidth) * bubbleWidth;
  // const tailStrokeLeftMidXBase = (167.579 / originalSvgWidth) * bubbleWidth;
  // const tailStrokeRightMidXBase = (182.21 / originalSvgWidth) * bubbleWidth;

  // Flip coordinates horizontally if tail direction is "left"
  const flipX = (x: number) => (tailDirection === "left" ? bubbleWidth - x : x);

  const tailTipX = flipX(tailTipXBase);
  const tailLeftX = flipX(tailLeftXBase);
  const tailLeftMidX = flipX(tailLeftMidXBase);
  // const tailStrokeLeftX = flipX(tailStrokeLeftXBase);
  // const tailStrokeLeftMidX = flipX(tailStrokeLeftMidXBase);
  // const tailStrokeRightMidX = flipX(tailStrokeRightMidXBase);

  // Y positions scaled relative to bubble height
  const tailBaseYLeft = tailBaseY;
  // const tailBaseYStroke = tailBaseY;
  const tailMidYLeft =
    tailBaseY +
    ((197.308 - originalTailBaseY) / originalTailHeight) * tailHeight;
  // const tailMidYStroke =
  //   tailBaseY +
  //   ((197.797 - originalTailBaseY) / originalTailHeight) * tailHeight;
  // const tailTipYStroke =
  //   tailBaseY +
  //   ((254.814 - originalTailBaseY) / originalTailHeight) * tailHeight;

  const tailPath = `M${tailTipX} ${tailTipY} L${tailLeftX} ${tailBaseYLeft} L${tailLeftMidX} ${tailMidYLeft} L${tailTipX} ${tailTipY} Z`;
  // const tailStrokePath = `M${tailStrokeLeftX} ${tailBaseYStroke} L${tailStrokeLeftMidX} ${tailMidYStroke} L${tailStrokeRightMidX} ${tailTipYStroke} L${tailStrokeLeftX} ${tailBaseYStroke} Z`;

  // SVG viewBox
  const viewBoxX = 0;
  const viewBoxY = 0;
  const viewBoxWidth = bubbleWidth;
  const viewBoxHeight = shouldShowTail ? bubbleHeight + tailHeight : bubbleHeight;

  // Build content
  const address = comparableInfo.address || "Enter address";
  const distance = comparableInfo.distance ?? "";
  
  // Calculate line spacing
  const lineGap = fontSizeText * 0.5;

  return (
    <>
      <AdvancedMarker
        position={position}
        draggable={!readOnly}
        onDragEnd={(e) => {
          if (readOnly) return;
          if (e.latLng) {
            onPositionChange({
              lat: e.latLng.lat(),
              lng: e.latLng.lng(),
            });
          }
        }}
        onClick={readOnly ? undefined : onClick}
      >
        <div
            className={`relative select-none ${readOnly ? "cursor-default" : "cursor-move"} ${previewMode ? "opacity-60" : ""}`}
            style={{
                width: `${bubbleWidth}px`,
                height: `${shouldShowTail ? bubbleHeight + tailHeight : bubbleHeight}px`,
            }}
        >
            {/* SVG Bubble with white fill and border */}
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

            {/* Content overlay - centered vertically and horizontally */}
            <div
                className="pointer-events-none absolute flex flex-col items-center justify-center text-black"
                style={{
                    left: 0,
                    top: 0,
                    width: `${bubbleWidth}px`,
                    height: `${bubbleHeight}px`,
                    padding: `${paddingY}px ${paddingX}px`,
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
      {isTailPinned && pinnedTailTipPosition && (
        <PinnedTailOverlay
          bubblePosition={position}
          pinnedTailTipPosition={pinnedTailTipPosition}
          bubbleWidth={bubbleWidth}
          bubbleHeight={bubbleHeight}
          color={color}
          strokeColor="black"
        />
      )}
    </>
  );
}
