"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";

interface PinnedTailOverlayProps {
  bubblePosition: { lat: number; lng: number };
  pinnedTailTipPosition: { lat: number; lng: number };
  bubbleWidth: number;
  bubbleHeight: number;
  color?: string;
  strokeColor?: string;
}

export function PinnedTailOverlay({
  bubblePosition,
  pinnedTailTipPosition,
  bubbleWidth,
  bubbleHeight,
  color = "#10b981",
  strokeColor,
}: PinnedTailOverlayProps) {
  const map = useMap();
  const polygonRef = useRef<google.maps.Polygon | null>(null);

  useEffect(() => {
    if (!map) return;

    const projection = map.getProjection();
    if (!projection) return;

    // Get map bounds and container size to calculate pixel-to-world conversion
    const bounds = map.getBounds();
    if (!bounds) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    // Calculate world coordinate range for the visible viewport
    const topLeftWorld = projection.fromLatLngToPoint(ne);
    const bottomRightWorld = projection.fromLatLngToPoint(sw);

    if (!topLeftWorld || !bottomRightWorld) return;

    const worldWidth = Math.abs(bottomRightWorld.x - topLeftWorld.x);
    const worldHeight = Math.abs(bottomRightWorld.y - topLeftWorld.y);

    const mapDiv = map.getDiv();
    if (!mapDiv) return;

    const mapWidthPx = mapDiv.offsetWidth;
    const mapHeightPx = mapDiv.offsetHeight;

    // Convert bubble dimensions from pixels to world coordinates
    const pixelsPerWorldUnitX = mapWidthPx / worldWidth;
    const pixelsPerWorldUnitY = mapHeightPx / worldHeight;

    // const bubbleWidthWorld = bubbleWidth / pixelsPerWorldUnitX;
    const bubbleHeightWorld = bubbleHeight / pixelsPerWorldUnitY;

    // Convert LatLng to world coordinates (normalized 0-1)
    // bubblePosition is the CENTER of the AdvancedMarker content (AdvancedMarker centers content)
    // The content div is centered at bubblePosition, so bubblePosition is the geometric center
    const bubblePositionWorld = projection.fromLatLngToPoint(
      new google.maps.LatLng(bubblePosition.lat, bubblePosition.lng),
    );
    const tipWorld = projection.fromLatLngToPoint(
      new google.maps.LatLng(
        pinnedTailTipPosition.lat,
        pinnedTailTipPosition.lng,
      ),
    );

    if (!bubblePositionWorld || !tipWorld) return;

    // bubblePositionWorld appears to be the bottom-center anchor point, not the true center
    // We need to offset upward by half the bubble height to get the true visual center
    // In world coordinates, Y increases downward, so we subtract half the height
    const bubbleCenterWorld = {
      x: bubblePositionWorld.x,
      y: bubblePositionWorld.y - bubbleHeightWorld / 2,
    };

    // Calculate direction from bubble center to tip (in world coordinates)
    const dx = tipWorld.x - bubbleCenterWorld.x;
    const dy = tipWorld.y - bubbleCenterWorld.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    // Normalize direction
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Tail dimensions in pixels
    // Wide end should be max 50% of bubble height, connecting to bubble center (fulcrum)
    const tailWideWidthPx = bubbleHeight * 0.5; // 50% of bubble height
    const tailNarrowWidthPx = 3; // Narrow end at tip (stays narrow)

    // Convert tail widths from pixels to world coordinates
    const avgPixelsPerWorldUnit =
      (pixelsPerWorldUnitX + pixelsPerWorldUnitY) / 2;
    const tailWideWidthWorld = tailWideWidthPx / avgPixelsPerWorldUnit;
    const tailNarrowWidthWorld = tailNarrowWidthPx / avgPixelsPerWorldUnit;

    // Perpendicular vector for tail width (in world coordinates)
    // This creates a vector perpendicular to the direction from bubble to tip
    const perpX = -dirY;
    const perpY = dirX;

    // Wide end points - these form a line segment centered at bubbleCenterWorld
    // The center of this line segment is exactly at bubbleCenterWorld (the fulcrum point)
    const wideHalfWidthWorld = tailWideWidthWorld / 2;

    // Calculate the two endpoints of the wide end line
    // These are positioned symmetrically on either side of bubbleCenterWorld
    const wideLeftWorld = {
      x: bubbleCenterWorld.x + perpX * wideHalfWidthWorld,
      y: bubbleCenterWorld.y + perpY * wideHalfWidthWorld,
    };
    const wideRightWorld = {
      x: bubbleCenterWorld.x - perpX * wideHalfWidthWorld,
      y: bubbleCenterWorld.y - perpY * wideHalfWidthWorld,
    };

    // Verify: The midpoint of wideLeftWorld and wideRightWorld should be bubbleCenterWorld
    // (wideLeftWorld.x + wideRightWorld.x) / 2 = bubbleCenterWorld.x ✓
    // (wideLeftWorld.y + wideRightWorld.y) / 2 = bubbleCenterWorld.y ✓

    // Narrow end points (at tip)
    const narrowHalfWidthWorld = tailNarrowWidthWorld / 2;
    const narrowLeftWorld = {
      x: tipWorld.x + perpX * narrowHalfWidthWorld,
      y: tipWorld.y + perpY * narrowHalfWidthWorld,
    };
    const narrowRightWorld = {
      x: tipWorld.x - perpX * narrowHalfWidthWorld,
      y: tipWorld.y - perpY * narrowHalfWidthWorld,
    };

    // Convert all points back to LatLng
    const wideLeftLatLng = projection.fromPointToLatLng(
      new google.maps.Point(wideLeftWorld.x, wideLeftWorld.y),
    );
    const wideRightLatLng = projection.fromPointToLatLng(
      new google.maps.Point(wideRightWorld.x, wideRightWorld.y),
    );
    const narrowLeftLatLng = projection.fromPointToLatLng(
      new google.maps.Point(narrowLeftWorld.x, narrowLeftWorld.y),
    );
    const narrowRightLatLng = projection.fromPointToLatLng(
      new google.maps.Point(narrowRightWorld.x, narrowRightWorld.y),
    );

    if (
      !wideLeftLatLng ||
      !wideRightLatLng ||
      !narrowLeftLatLng ||
      !narrowRightLatLng
    )
      return;

    // Create trapezoid path: wide end -> narrow end
    // Order: wideLeft -> wideRight -> narrowRight -> narrowLeft -> wideLeft
    const path = [
      { lat: wideLeftLatLng.lat(), lng: wideLeftLatLng.lng() },
      { lat: wideRightLatLng.lat(), lng: wideRightLatLng.lng() },
      { lat: narrowRightLatLng.lat(), lng: narrowRightLatLng.lng() },
      { lat: narrowLeftLatLng.lat(), lng: narrowLeftLatLng.lng() },
    ];

    // Use strokeColor if provided, otherwise default to fill color
    const finalStrokeColor = strokeColor ?? color;

    // Create or update polygon
    if (!polygonRef.current) {
      polygonRef.current = new google.maps.Polygon({
        paths: path,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: finalStrokeColor,
        strokeOpacity: 0.8,
        strokeWeight: 1,
        map,
        zIndex: 1,
      });
    } else {
      polygonRef.current.setPaths(path);
      polygonRef.current.setOptions({
        fillColor: color,
        strokeColor: finalStrokeColor,
      });
    }

    return () => {
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
        polygonRef.current = null;
      }
    };
  }, [
    map,
    bubblePosition.lat,
    bubblePosition.lng,
    pinnedTailTipPosition.lat,
    pinnedTailTipPosition.lng,
    bubbleWidth,
    bubbleHeight,
    color,
    strokeColor,
  ]);

  return null;
}
