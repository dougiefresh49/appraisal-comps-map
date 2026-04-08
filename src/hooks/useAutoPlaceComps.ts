"use client";

import { useState, useCallback } from "react";
import type { ComparableInfo, LatLng } from "~/utils/projectStore";

// Base bubble pixel dimensions (must match ComparableMarker.tsx + SubjectLocationMarker.tsx)
const COMP_BUBBLE_WIDTH = 360;
const COMP_BUBBLE_HEIGHT = 160;
const SUBJECT_BUBBLE_WIDTH = 400;
const SUBJECT_BUBBLE_HEIGHT = 200;

// Gap between bubbles in pixels
const BUBBLE_GAP_PX = 28;

interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Convert horizontal pixel distance to longitude degrees at the given
 * latitude and zoom level.
 */
function pxToLngDeg(px: number, zoom: number, refLat: number): number {
  const safeZoom = Math.max(zoom, 1);
  const metersPerPixel = 156543.03392 / Math.pow(2, safeZoom);
  const cosLat = Math.max(Math.cos((refLat * Math.PI) / 180), 0.001);
  return (px * metersPerPixel) / (111320 * cosLat);
}

/**
 * Convert vertical pixel distance to latitude degrees at the given
 * latitude and zoom level.
 */
function pxToLatDeg(px: number, zoom: number, refLat: number): number {
  const safeZoom = Math.max(zoom, 1);
  const metersPerPixel =
    (156543.03392 * Math.cos((refLat * Math.PI) / 180)) / Math.pow(2, safeZoom);
  return (px * metersPerPixel) / 111320;
}

function makeBBox(
  center: LatLng,
  widthPx: number,
  heightPx: number,
  sizeMultiplier: number,
  zoom: number,
  gapPx = BUBBLE_GAP_PX,
): BBox {
  const halfW = (widthPx * sizeMultiplier) / 2 + gapPx;
  const halfH = (heightPx * sizeMultiplier) / 2 + gapPx;
  return {
    minLat: center.lat - pxToLatDeg(halfH, zoom, center.lat),
    maxLat: center.lat + pxToLatDeg(halfH, zoom, center.lat),
    minLng: center.lng - pxToLngDeg(halfW, zoom, center.lat),
    maxLng: center.lng + pxToLngDeg(halfW, zoom, center.lat),
  };
}

function boxesOverlap(a: BBox, b: BBox): boolean {
  return !(
    a.maxLat < b.minLat ||
    a.minLat > b.maxLat ||
    a.maxLng < b.minLng ||
    a.minLng > b.maxLng
  );
}

/**
 * Try 8 directions at increasing radii until a non-overlapping center is
 * found for a bubble of the given pixel size. Returns the first candidate
 * that does not overlap any obstacle box.
 */
function resolveNonOverlappingPosition(
  initial: LatLng,
  obstacles: BBox[],
  widthPx: number,
  heightPx: number,
  sizeMultiplier: number,
  zoom: number,
): LatLng {
  const stepLat = pxToLatDeg(
    (heightPx * sizeMultiplier) / 2 + BUBBLE_GAP_PX,
    zoom,
    initial.lat,
  );
  const stepLng = pxToLngDeg(
    (widthPx * sizeMultiplier) / 2 + BUBBLE_GAP_PX,
    zoom,
    initial.lat,
  );
  const step = Math.max(stepLat, stepLng);

  // 8 compass directions tested at each radius level
  const dirs = [
    { lat: 0, lng: 1 }, // E
    { lat: -1, lng: 1 }, // SE
    { lat: -1, lng: 0 }, // S
    { lat: -1, lng: -1 }, // SW
    { lat: 0, lng: -1 }, // W
    { lat: 1, lng: -1 }, // NW
    { lat: 1, lng: 0 }, // N
    { lat: 1, lng: 1 }, // NE
  ];

  for (let r = 1; r <= 20; r++) {
    for (const dir of dirs) {
      const candidate: LatLng = {
        lat: initial.lat + dir.lat * step * r,
        lng: initial.lng + dir.lng * step * r,
      };
      const bbox = makeBBox(
        candidate,
        widthPx,
        heightPx,
        sizeMultiplier,
        zoom,
      );
      if (!obstacles.some((obs) => boxesOverlap(bbox, obs))) {
        return candidate;
      }
    }
  }

  // Hard fallback: push far north-east
  return {
    lat: initial.lat + step * 21,
    lng: initial.lng + step * 21,
  };
}

async function geocodeAddress(address: string): Promise<LatLng | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  // Fast path: already a decimal "lat, lng" string
  const decimalMatch =
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(trimmed);
  if (decimalMatch) {
    return { lat: Number(decimalMatch[1]), lng: Number(decimalMatch[2]) };
  }

  return new Promise<LatLng | null>((resolve) => {
    const geocoder = new google.maps.Geocoder();
    void geocoder.geocode({ address: trimmed }, (results, status) => {
      if (
        status === google.maps.GeocoderStatus.OK &&
        results &&
        results.length > 0
      ) {
        const loc = results[0]!.geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

export interface AutoPlaceOptions {
  comparables: ComparableInfo[];
  subjectMarkerPosition: LatLng | null;
  subjectBubblePosition: LatLng | null;
  bubbleSize: number;
  mapZoom: number;
  /** Called when the user accepts the proposed placement. */
  onApply: (proposed: ComparableInfo[]) => void;
}

export interface AutoPlaceResult {
  /** Non-null while the user is reviewing a proposed auto-placement. */
  proposedComparables: ComparableInfo[] | null;
  /** True while geocoding is in progress. */
  isAutoPlacing: boolean;
  /** IDs of comps that could not be geocoded or resolved. */
  failedCompIds: string[];
  /** Trigger geocoding + layout calculation. */
  autoPlace: () => Promise<void>;
  /** Accept the proposed placement and invoke `onApply`. */
  applyProposal: () => void;
  /** Discard the proposed placement without saving. */
  cancelProposal: () => void;
}

export function useAutoPlaceComps({
  comparables,
  subjectMarkerPosition,
  subjectBubblePosition,
  bubbleSize,
  mapZoom,
  onApply,
}: AutoPlaceOptions): AutoPlaceResult {
  const [proposedComparables, setProposedComparables] =
    useState<ComparableInfo[] | null>(null);
  const [isAutoPlacing, setIsAutoPlacing] = useState(false);
  const [failedCompIds, setFailedCompIds] = useState<string[]>([]);

  const autoPlace = useCallback(async () => {
    setIsAutoPlacing(true);
    setProposedComparables(null);
    setFailedCompIds([]);

    // Reference latitude for degree↔pixel conversions
    const refLat =
      subjectMarkerPosition?.lat ??
      comparables.find((c) => c.markerPosition)?.markerPosition?.lat ??
      32;

    // Obstacle list — subject bubble is a fixed obstacle
    const placedBoxes: BBox[] = [];
    if (subjectBubblePosition) {
      placedBoxes.push(
        makeBBox(
          subjectBubblePosition,
          SUBJECT_BUBBLE_WIDTH,
          SUBJECT_BUBBLE_HEIGHT,
          bubbleSize,
          mapZoom,
        ),
      );
    }

    const failed: string[] = [];
    const proposed: ComparableInfo[] = [];

    for (const comp of comparables) {
      // ── Step 1: Resolve property pin ──────────────────────────────────────
      let markerPos: LatLng | undefined = comp.markerPosition;

      if (!markerPos) {
        if (comp.pinnedTailTipPosition) {
          // Tail tip pinned from original report → use as the property pin
          markerPos = comp.pinnedTailTipPosition;
        } else if (comp.address.trim()) {
          const geocoded = await geocodeAddress(comp.address);
          if (geocoded) {
            markerPos = geocoded;
          } else {
            failed.push(comp.id);
            proposed.push(comp);
            continue;
          }
        } else {
          // No position or address to resolve
          failed.push(comp.id);
          proposed.push(comp);
          continue;
        }
      }

      // ── Step 2: Determine initial bubble position ─────────────────────────
      const defaultOffset: LatLng = {
        lat:
          markerPos.lat +
          pxToLatDeg(
            (COMP_BUBBLE_HEIGHT * bubbleSize) / 2 + BUBBLE_GAP_PX * 2,
            mapZoom,
            refLat,
          ),
        lng:
          markerPos.lng +
          pxToLngDeg(
            (COMP_BUBBLE_WIDTH * bubbleSize) / 2 + BUBBLE_GAP_PX * 2,
            mapZoom,
            refLat,
          ),
      };

      // Prefer the comp's existing bubble position if present
      let bubblePos = comp.position ?? defaultOffset;

      // ── Step 3: Collision detection + nudge ───────────────────────────────
      const bbox = makeBBox(
        bubblePos,
        COMP_BUBBLE_WIDTH,
        COMP_BUBBLE_HEIGHT,
        bubbleSize,
        mapZoom,
      );

      if (placedBoxes.some((obs) => boxesOverlap(bbox, obs))) {
        bubblePos = resolveNonOverlappingPosition(
          defaultOffset,
          placedBoxes,
          COMP_BUBBLE_WIDTH,
          COMP_BUBBLE_HEIGHT,
          bubbleSize,
          mapZoom,
        );
      }

      // Register as obstacle for subsequent comps
      placedBoxes.push(
        makeBBox(
          bubblePos,
          COMP_BUBBLE_WIDTH,
          COMP_BUBBLE_HEIGHT,
          bubbleSize,
          mapZoom,
        ),
      );

      proposed.push({
        ...comp,
        markerPosition: markerPos,
        position: bubblePos,
        isTailPinned: true,
        pinnedTailTipPosition: markerPos,
      });
    }

    setFailedCompIds(failed);
    setProposedComparables(proposed);
    setIsAutoPlacing(false);
  }, [
    comparables,
    subjectMarkerPosition,
    subjectBubblePosition,
    bubbleSize,
    mapZoom,
  ]);

  const applyProposal = useCallback(() => {
    if (proposedComparables) {
      onApply(proposedComparables);
      setProposedComparables(null);
      setFailedCompIds([]);
    }
  }, [proposedComparables, onApply]);

  const cancelProposal = useCallback(() => {
    setProposedComparables(null);
    setFailedCompIds([]);
  }, []);

  return {
    proposedComparables,
    isAutoPlacing,
    failedCompIds,
    autoPlace,
    applyProposal,
    cancelProposal,
  };
}
