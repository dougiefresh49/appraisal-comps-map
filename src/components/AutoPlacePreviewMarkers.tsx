"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { ComparableMarker } from "~/components/ComparableMarker";
import { PinnedTailOverlay } from "~/components/PinnedTailOverlay";
import type { ComparableInfo } from "~/utils/projectStore";

interface AutoPlacePreviewMarkersProps {
  proposedComparables: ComparableInfo[];
  bubbleSize: number;
  /** Accent color for the comp bubbles (matches the map page's comp color). */
  compColor: string;
}

/**
 * Renders ghost markers inside a `<Map>` to preview the auto-placement
 * result before the user commits. Each comp is shown with reduced opacity
 * to clearly distinguish it from the live markers.
 */
export function AutoPlacePreviewMarkers({
  proposedComparables,
  bubbleSize,
  compColor,
}: AutoPlacePreviewMarkersProps) {
  return (
    <>
      {proposedComparables.map((comp, index) => {
        if (!comp.position) return null;

        return (
          <span key={comp.id}>
            {/* Property pin dot */}
            {comp.markerPosition && (
              <AdvancedMarker position={comp.markerPosition}>
                <div
                  className="rounded-full border-2 border-white shadow-lg"
                  style={{
                    width: 16,
                    height: 16,
                    backgroundColor: compColor,
                    opacity: 0.7,
                  }}
                />
              </AdvancedMarker>
            )}

            {/* Tail polygon */}
            {comp.isTailPinned && comp.pinnedTailTipPosition && (
              <PinnedTailOverlay
                bubblePosition={comp.position}
                pinnedTailTipPosition={comp.pinnedTailTipPosition}
                bubbleWidth={360 * bubbleSize}
                bubbleHeight={160 * bubbleSize}
                color={compColor}
                strokeColor="black"
                fillOpacity={0.45}
              />
            )}

            {/* Bubble */}
            <ComparableMarker
              position={comp.position}
              markerPosition={comp.markerPosition}
              comparableNumber={index + 1}
              comparableInfo={comp}
              onPositionChange={() => {
                /* preview — not draggable */
              }}
              sizeMultiplier={bubbleSize}
              color={compColor}
              isTailPinned={comp.isTailPinned}
              pinnedTailTipPosition={comp.pinnedTailTipPosition}
              readOnly
              previewMode
            />
          </span>
        );
      })}
    </>
  );
}
