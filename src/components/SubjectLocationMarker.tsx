"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";

interface PropertyInfo {
  address: string;
  addressForDisplay?: string;
  legalDescription?: string;
  acres?: string;
}

interface SubjectLocationMarkerProps {
  position: { lat: number; lng: number };
  markerPosition: { lat: number; lng: number };
  propertyInfo: PropertyInfo;
  onPositionChange: (position: { lat: number; lng: number }) => void;
  sizeMultiplier?: number; // 1.0 = 100% (400x200 base)
  tailDirection?: "left" | "right";
  isTailPinned?: boolean;
  pinnedTailTipPosition?: { lat: number; lng: number };
  title?: string; // Optional title override. If not provided, uses address or "Subject"
  readOnly?: boolean;
}

// Base dimensions (reference: 400x200px)
const BASE_WIDTH = 400;
const BASE_HEIGHT = 200;
const BASE_PADDING_X = 40;
const BASE_PADDING_Y = 32;
const BASE_FONT_SIZE_TITLE = 24;
const BASE_FONT_SIZE_TEXT = 18;

export function SubjectLocationMarker({
  position,
  // markerPosition,
  propertyInfo,
  onPositionChange,
  sizeMultiplier = 1.0,
  tailDirection = "right",
  isTailPinned = false,
  // pinnedTailTipPosition,
  title,
  readOnly = false,
}: SubjectLocationMarkerProps) {
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
  const hasAcres = Boolean(propertyInfo.acres);
  const hasLegalDescription = Boolean(propertyInfo.legalDescription);
  const addressLine =
    propertyInfo.addressForDisplay?.trim()
      ? propertyInfo.addressForDisplay
      : propertyInfo.address;
  const address = addressLine || "Enter address";

  // Determine title: use prop if provided, otherwise use address, fallback to "Subject"
  const bubbleTitle = title ?? address ?? "Subject";

  // Calculate line spacing

  const lineGap = fontSizeText * 1;

  // When tail is pinned, don't render the tail in SVG - it's handled by PinnedTailOverlay
  const shouldShowTail = !isTailPinned;

  // Tail dimensions from original SVG (scaled with size multiplier)
  // Original SVG is 438px wide, bubble height is 198px, tail extends from y=195 to y=256
  const originalSvgWidth = 438;
  const originalSvgBubbleHeight = 198;
  const originalTailBaseY = 195.184;
  const originalTailTipY = 256.007;
  const originalTailHeight = originalTailTipY - originalTailBaseY; // ~61px

  // Scale factor based on bubble width (maintaining aspect ratio)
  // const widthScale = bubbleWidth / originalSvgWidth;
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
  const tailStrokeLeftXBase = (98.6449 / originalSvgWidth) * bubbleWidth;
  const tailStrokeLeftMidXBase = (167.579 / originalSvgWidth) * bubbleWidth;
  const tailStrokeRightMidXBase = (182.21 / originalSvgWidth) * bubbleWidth;

  // Flip coordinates horizontally if tail direction is "left"
  const flipX = (x: number) => (tailDirection === "left" ? bubbleWidth - x : x);

  const tailTipX = flipX(tailTipXBase);
  const tailLeftX = flipX(tailLeftXBase);
  const tailLeftMidX = flipX(tailLeftMidXBase);
  const tailStrokeLeftX = flipX(tailStrokeLeftXBase);
  const tailStrokeLeftMidX = flipX(tailStrokeLeftMidXBase);
  const tailStrokeRightMidX = flipX(tailStrokeRightMidXBase);

  // Y positions scaled relative to bubble height
  const tailBaseYLeft = tailBaseY;
  const tailBaseYStroke = tailBaseY;
  const tailMidYLeft =
    tailBaseY +
    ((197.308 - originalTailBaseY) / originalTailBaseY) * heightScale;
  const tailMidYStroke =
    tailBaseY +
    ((197.797 - originalTailBaseY) / originalTailBaseY) * heightScale;
  const tailTipYStroke =
    tailBaseY +
    ((254.814 - originalTailBaseY) / originalTailBaseY) * heightScale;

  return (
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
    >
      <div
        className={`relative select-none ${readOnly ? "cursor-default" : "cursor-move"}`}
        style={{
          width: `${bubbleWidth}px`,
          height: `${shouldShowTail ? bubbleHeight + tailHeight : bubbleHeight}px`,
        }}
      >
        {/* SVG Bubble */}
        <svg
          width={bubbleWidth}
          height={shouldShowTail ? bubbleHeight + tailHeight : bubbleHeight}
          viewBox={`0 0 ${bubbleWidth} ${shouldShowTail ? bubbleHeight + tailHeight : bubbleHeight}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0"
        >
          {/* Tail - using original SVG shape exactly - only show when not pinned */}
          {shouldShowTail && (
            <>
              {/* Fill path: M183.032 256.007L97.0014 195.184L167.97 197.308L183.032 256.007Z */}
              <path
                d={`M${tailTipX} ${tailTipY} L${tailLeftX} ${tailBaseYLeft} L${tailLeftMidX} ${tailMidYLeft} L${tailTipX} ${tailTipY} Z`}
                fill="white"
              />
              {/* Stroke path: M98.6449 195.734L167.579 197.797L182.21 254.814L98.6449 195.734Z */}
              <path
                d={`M${tailStrokeLeftX} ${tailBaseYStroke} L${tailStrokeLeftMidX} ${tailMidYStroke} L${tailStrokeRightMidX} ${tailTipYStroke} L${tailStrokeLeftX} ${tailBaseYStroke} Z`}
                stroke="black"
                strokeOpacity="0.8"
                strokeWidth={1 * sizeMultiplier}
                fill="none"
              />
            </>
          )}
          {/* Bubble rectangle */}
          <rect
            x={0.5 * sizeMultiplier}
            y={0.5 * sizeMultiplier}
            width={bubbleWidth - sizeMultiplier}
            height={bubbleHeight - sizeMultiplier}
            rx={borderRadius}
            fill="white"
          />
          <rect
            x={0.5 * sizeMultiplier}
            y={0.5 * sizeMultiplier}
            width={bubbleWidth - sizeMultiplier}
            height={bubbleHeight - sizeMultiplier}
            rx={borderRadius}
            stroke="black"
            strokeWidth={1 * sizeMultiplier}
            fill="none"
          />
        </svg>

        {/* Content overlay - Centered */}
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
            {bubbleTitle}
          </div>

          {/* Address - left-aligned, bold (only show if title is not the address) */}
          {address && title !== address && bubbleTitle !== address && (
            <div
              className="font-bold"
              style={{ fontSize: `${fontSizeText}px` }}
            >
              {address}
            </div>
          )}

          {/* Acres and Legal Description - left-aligned, regular weight */}
          {hasAcres && (
            <div style={{ fontSize: `${fontSizeText}px`, fontWeight: 400 }}>
              Acres: {propertyInfo.acres}
              {propertyInfo.legalDescription &&
                `, ${propertyInfo.legalDescription}`}
            </div>
          )}

          {!hasAcres && hasLegalDescription && (
            <div style={{ fontSize: `${fontSizeText}px`, fontWeight: 400 }}>
              {propertyInfo.legalDescription}
            </div>
          )}
        </div>
      </div>
    </AdvancedMarker>
  );
}
