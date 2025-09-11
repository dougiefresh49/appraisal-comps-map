"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import { env } from "~/env";

// Types
type Property = {
  type: "subject" | "comp";
  id: number;
  position: { lat: number; lng: number };
  address: string;
  compNumber: string;
  distance?: number;
};

// Sample data based on your Midland, TX example
const properties: Property[] = [
  {
    type: "subject",
    id: 0,
    position: { lat: 32.003685, lng: -102.080769 },
    address: "600 W Louisiana Ave, Midland, TX 79701",
    compNumber: "SUBJECT",
  },
  {
    type: "comp",
    id: 1,
    position: { lat: 31.850057, lng: -102.369181 },
    address: "618 N TEXAS AVE, ODESSA, TX 79761",
    compNumber: "COMPARABLE No. 1",
    distance: 19.96,
  },
  {
    type: "comp",
    id: 2,
    position: { lat: 32.001695, lng: -102.07947 },
    address: "507 N. Marienfeld, Midland, TX 79701",
    compNumber: "COMPARABLE No. 2",
    distance: 0.16,
  },
  {
    type: "comp",
    id: 3,
    position: { lat: 32.015752, lng: -102.141736 },
    address: "4409 W Wadley Ave, Midland, TX 79707",
    compNumber: "COMPARABLE No. 3",
    distance: 3.64,
  },
  {
    type: "comp",
    id: 4,
    position: { lat: 32.032372, lng: -102.146854 },
    address: "4715 N Midland Dr, Midland, TX 79707-3381",
    compNumber: "COMPARABLE No. 4",
    distance: 4.35,
  },
  {
    type: "comp",
    id: 5,
    position: { lat: 32.003646, lng: -102.081992 },
    address: "700 W Louisiana Ave, Midland, TX 79701-3249",
    compNumber: "COMPARABLE No. 5",
    distance: 0.07,
  },
];

// Simple bubble component using AdvancedMarker
interface BubbleProps {
  property: Property;
  position: { lat: number; lng: number };
  onDragEnd: (newPosition: { lat: number; lng: number }) => void;
  markerPosition: { lat: number; lng: number };
  onSizeChange: (id: number, size: { width: number; height: number }) => void;
}

const CompBubble: React.FC<BubbleProps> = ({
  property,
  position,
  onDragEnd,
  markerPosition,
  onSizeChange,
}) => {
  const isSubject = property.type === "subject";
  const bubbleColor = isSubject ? "#B40404" : "#007bff";
  const borderColor = isSubject ? "#8B0000" : "#0056b3";

  const contentRef = useRef<HTMLDivElement | null>(null);

  // Measure bubble size (in pixels) so tails can attach precisely
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        onSizeChange(property.id, { width: rect.width, height: rect.height });
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [property.id]); // Remove onSizeChange from dependencies to prevent infinite loop

  return (
    <AdvancedMarker
      position={position}
      draggable
      onDragEnd={(event) => {
        if (event.latLng) {
          const next = {
            lat: event.latLng.lat(),
            lng: event.latLng.lng(),
          };
          if (property.id === 5) {
            // Debug: trace Comp 5 bubble movement
            // eslint-disable-next-line no-console
            console.log(
              "[Comp 5] Bubble moved:",
              JSON.stringify({ lat: next.lat, lng: next.lng }, null, 2),
            );
          }
          onDragEnd(next);
        }
      }}
    >
      <div
        ref={contentRef}
        style={{
          background: "white",
          color: "black",
          padding: "12px 16px",
          borderRadius: "12px",
          minWidth: "200px",
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          border: `2px solid ${borderColor}`,
          textAlign: "left",
          lineHeight: "1.4",
          cursor: "move",
        }}
      >
        <div
          style={{
            fontWeight: "bold",
            fontSize: "16px",
            marginBottom: "4px",
            color: bubbleColor,
          }}
        >
          {property.compNumber}
        </div>
        <div
          style={{
            fontSize: "12px",
            marginBottom: "2px",
          }}
        >
          {property.address}
        </div>
        {property.distance !== undefined && (
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              color: bubbleColor,
            }}
          >
            {property.distance.toFixed(2)} miles
          </div>
        )}
      </div>
    </AdvancedMarker>
  );
};

// Tail component using Polygon for triangle shape
interface TailProps {
  id: number;
  bubblePosition: { lat: number; lng: number };
  markerPosition: { lat: number; lng: number };
  color: string;
  bubbleSizePx?: { width: number; height: number };
}

const CompTail: React.FC<TailProps> = ({
  id,
  bubblePosition,
  markerPosition,
  color,
  bubbleSizePx,
}) => {
  const map = useMap();
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const bubbleSizesRef = useRef<
    Record<number, { width: number; height: number }>
  >({});

  useEffect(() => {
    if (!map) return;

    // Debug: Log when recalculation happens (remove this later)
    // if (id === 5) {
    //   console.log(`[Comp 5] RECALCULATING tail - bubble: ${bubblePosition.lat}, ${bubblePosition.lng}`);
    // }

    // Simple triangle approach: points directly to bubble center
    const calculateTrianglePoints = () => {
      // Use map projection for accurate pixel geometry
      const proj = map.getProjection();
      if (!proj) return [];
      const zoomScale = Math.pow(2, map.getZoom() ?? 0);

      const bubblePoint = proj.fromLatLngToPoint(
        new google.maps.LatLng(bubblePosition.lat, bubblePosition.lng),
      );
      const markerPoint = proj.fromLatLngToPoint(
        new google.maps.LatLng(markerPosition.lat, markerPosition.lng),
      );
      if (!bubblePoint || !markerPoint) return [];

      // Convert to screen pixels relative to zoom
      const toPixels = (p: google.maps.Point) =>
        new google.maps.Point(p.x * zoomScale, p.y * zoomScale);
      const bubbleAnchorPx = toPixels(bubblePoint);
      const markerPx = toPixels(markerPoint);

      // Get bubble dimensions for visual center calculation
      const fallback = { width: 240, height: 80 };
      const bubbleWidthPx = bubbleSizePx?.width ?? fallback.width;
      const bubbleHeightPx = bubbleSizePx?.height ?? fallback.height;

      // Target the actual top edge of the bubble to ensure perfect connection
      // Add extra offset when bubble is above marker to ensure visual connection
      const bubbleAboveMarker = bubblePosition.lat > markerPosition.lat;
      const extraOffset = bubbleAboveMarker ? 450 : 0; // Extra pixels when above

      console.log("extraOffset", extraOffset);
      const bubblePx = new google.maps.Point(
        bubbleAnchorPx.x, // X is already centered
        bubbleAnchorPx.y - bubbleHeightPx - extraOffset, // Move up to top edge + extra offset if above
      );

      // Debug: Log the coordinate transformation
      if (id === 5) {
        console.log("[Comp 5] Coordinate debugging:");
        console.log("  bubbleAnchorPx:", {
          x: bubbleAnchorPx.x,
          y: bubbleAnchorPx.y,
        });
        console.log("  bubblePx (with offset):", {
          x: bubblePx.x,
          y: bubblePx.y,
        });
        console.log("  bubbleHeightPx:", bubbleHeightPx);
        console.log("  extraOffset:", extraOffset);
        console.log("  difference:", bubbleAnchorPx.y - bubblePx.y);
      }

      // Calculate direction from marker to bubble visual center
      const dx = bubblePx.x - markerPx.x;
      const dy = bubblePx.y - markerPx.y;
      const distance = Math.hypot(dx, dy);

      if (distance === 0) return []; // Avoid division by zero

      // Normalized direction vector
      const unitX = dx / distance;
      const unitY = dy / distance;

      // Perpendicular vector for base width
      const perpX = -unitY;
      const perpY = unitX;

      // Base width in pixels (make it wider for better coverage)
      const baseWidthPx = 30;
      const halfBase = baseWidthPx / 2;

      // Create triangle base at the bubble center
      const base1 = new google.maps.Point(
        bubblePx.x + perpX * halfBase,
        bubblePx.y + perpY * halfBase,
      );
      const base2 = new google.maps.Point(
        bubblePx.x - perpX * halfBase,
        bubblePx.y - perpY * halfBase,
      );

      // Triangle tip is at markerPx
      const tipPx = new google.maps.Point(markerPx.x, markerPx.y);

      // Convert pixel points back to LatLng
      const fromPixels = (p: google.maps.Point) =>
        proj.fromPointToLatLng(
          new google.maps.Point(p.x / zoomScale, p.y / zoomScale),
        )!;
      const tipLL = fromPixels(tipPx);
      const b1LL = fromPixels(base1);
      const b2LL = fromPixels(base2);

      // Debug: Log final coordinate conversion
      if (id === 5) {
        console.log("[Comp 5] Final coordinates:");
        console.log("  tipPx:", { x: tipPx.x, y: tipPx.y }, "-> tipLL:", {
          lat: tipLL.lat(),
          lng: tipLL.lng(),
        });
        console.log("  base1Px:", { x: base1.x, y: base1.y }, "-> base1LL:", {
          lat: b1LL.lat(),
          lng: b1LL.lng(),
        });
        console.log("  base2Px:", { x: base2.x, y: base2.y }, "-> base2LL:", {
          lat: b2LL.lat(),
          lng: b2LL.lng(),
        });
      }

      // Debug logs for Comp 5 (remove this later)
      // if (id === 5) {
      //   console.log(`[Comp 5] Triangle created successfully`);
      // }

      const result = [
        { lat: tipLL.lat(), lng: tipLL.lng() },
        { lat: b1LL.lat(), lng: b1LL.lng() },
        { lat: b2LL.lat(), lng: b2LL.lng() },
      ];

      // Debug: Check for degenerate triangles (remove this later)
      // if (id === 5 && result.length === 3) {
      //   const p1 = result[0]!;
      //   const p2 = result[1]!;
      //   const p3 = result[2]!;
      //   const area = Math.abs((p1.lat * (p2.lng - p3.lng) + p2.lat * (p3.lng - p1.lng) + p3.lat * (p1.lng - p2.lng)) / 2);
      //   if (area < 0.0001) console.log(`[Comp 5] WARNING: Triangle is very small!`);
      // }

      return result;
    };

    const trianglePoints = calculateTrianglePoints();

    if (trianglePoints.length === 3) {
      // Create polygon for the triangle tail
      const polygon = new google.maps.Polygon({
        paths: trianglePoints,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 1,
        fillColor: color,
        fillOpacity: 0.7,
        map: map,
        zIndex: 10,
        clickable: false,
      });

      // Store polygon for cleanup

      polygonRef.current = polygon;

      return () => {
        polygon.setMap(null);
        polygonRef.current = null;
      };
    }
  }, [
    map,
    bubblePosition.lat,
    bubblePosition.lng,
    markerPosition.lat,
    markerPosition.lng,
    color,
    bubbleSizePx?.width,
    bubbleSizePx?.height,
    id, // Add id to ensure we can distinguish between different tails in debugging
  ]);

  // Update polygon when positions change
  useEffect(() => {
    if (polygonRef.current) {
      // Recalculate triangle points using the same improved logic
      const dx = markerPosition.lng - bubblePosition.lng;
      const dy = markerPosition.lat - bubblePosition.lat;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0) {
        const nx = dx / distance;
        const ny = dy / distance;
        const perpX = -ny;
        const perpY = nx;

        const triangleWidth = 0.0015;
        const bubbleSizeLat = 0.002;
        const bubbleSizeLng = 0.003;

        // Calculate the four corners of the bubble
        const topLeft = {
          lat: bubblePosition.lat + bubbleSizeLat / 2,
          lng: bubblePosition.lng - bubbleSizeLng / 2,
        };
        const topRight = {
          lat: bubblePosition.lat + bubbleSizeLat / 2,
          lng: bubblePosition.lng + bubbleSizeLng / 2,
        };
        const bottomLeft = {
          lat: bubblePosition.lat - bubbleSizeLat / 2,
          lng: bubblePosition.lng - bubbleSizeLng / 2,
        };
        const bottomRight = {
          lat: bubblePosition.lat - bubbleSizeLat / 2,
          lng: bubblePosition.lng + bubbleSizeLng / 2,
        };

        // Calculate distances from marker to each corner
        const distToTopLeft = Math.sqrt(
          Math.pow(markerPosition.lat - topLeft.lat, 2) +
            Math.pow(markerPosition.lng - topLeft.lng, 2),
        );
        const distToTopRight = Math.sqrt(
          Math.pow(markerPosition.lat - topRight.lat, 2) +
            Math.pow(markerPosition.lng - topRight.lng, 2),
        );
        const distToBottomLeft = Math.sqrt(
          Math.pow(markerPosition.lat - bottomLeft.lat, 2) +
            Math.pow(markerPosition.lng - bottomLeft.lng, 2),
        );
        const distToBottomRight = Math.sqrt(
          Math.pow(markerPosition.lat - bottomRight.lat, 2) +
            Math.pow(markerPosition.lng - bottomRight.lng, 2),
        );

        // Find the closest corner
        const minCornerDist = Math.min(
          distToTopLeft,
          distToTopRight,
          distToBottomLeft,
          distToBottomRight,
        );

        // Check if we should connect to a corner or an edge center
        const edgeThreshold = 0.3;

        let attachLat, attachLng;

        if (
          Math.abs(dx) / bubbleSizeLng < edgeThreshold &&
          Math.abs(dy) / bubbleSizeLat > edgeThreshold
        ) {
          // Connect to left or right edge center
          if (dx > 0) {
            attachLat = bubblePosition.lat;
            attachLng = bubblePosition.lng + bubbleSizeLng / 2;
          } else {
            attachLat = bubblePosition.lat;
            attachLng = bubblePosition.lng - bubbleSizeLng / 2;
          }
        } else if (
          Math.abs(dy) / bubbleSizeLat < edgeThreshold &&
          Math.abs(dx) / bubbleSizeLng > edgeThreshold
        ) {
          // Connect to top or bottom edge center
          if (dy > 0) {
            attachLat = bubblePosition.lat - bubbleSizeLat / 2;
            attachLng = bubblePosition.lng;
          } else {
            attachLat = bubblePosition.lat + bubbleSizeLat / 2;
            attachLng = bubblePosition.lng;
          }
        } else {
          // Connect to the closest corner
          if (minCornerDist === distToTopLeft) {
            attachLat = topLeft.lat;
            attachLng = topLeft.lng;
          } else if (minCornerDist === distToTopRight) {
            attachLat = topRight.lat;
            attachLng = topRight.lng;
          } else if (minCornerDist === distToBottomLeft) {
            attachLat = bottomLeft.lat;
            attachLng = bottomLeft.lng;
          } else {
            attachLat = bottomRight.lat;
            attachLng = bottomRight.lng;
          }
        }

        const tipLat = markerPosition.lat;
        const tipLng = markerPosition.lng;

        // Calculate triangle base points - SIMPLIFIED APPROACH
        const extendIntoBubble = 0.0005; // Small amount to extend into bubble
        let base1Lat, base1Lng, base2Lat, base2Lng;
        const isAbove = bubblePosition.lat > markerPosition.lat;
        const extraLat = isAbove ? 0.0005 : 0; // small extra in Y (lat) if bubble is above

        // For edge connections, make the base span the full edge
        if (
          Math.abs(dx) / bubbleSizeLng < edgeThreshold &&
          Math.abs(dy) / bubbleSizeLat > edgeThreshold
        ) {
          // Left/Right edge - base spans full height
          const baseHeight = bubbleSizeLat * 0.9; // Use 90% of bubble height (thicker)
          base1Lat =
            attachLat + baseHeight / 2 + ny * extendIntoBubble + extraLat;
          base1Lng = attachLng + nx * extendIntoBubble;
          base2Lat =
            attachLat - baseHeight / 2 + ny * extendIntoBubble + extraLat;
          base2Lng = attachLng + nx * extendIntoBubble;
        } else if (
          Math.abs(dy) / bubbleSizeLat < edgeThreshold &&
          Math.abs(dx) / bubbleSizeLng > edgeThreshold
        ) {
          // Top/Bottom edge - base spans full width
          const baseWidth = bubbleSizeLng * 0.9; // Use 90% of bubble width (thicker)
          base1Lat = attachLat + ny * extendIntoBubble + extraLat;
          base1Lng = attachLng + baseWidth / 2 + nx * extendIntoBubble;
          base2Lat = attachLat + ny * extendIntoBubble + extraLat;
          base2Lng = attachLng - baseWidth / 2 + nx * extendIntoBubble;
        } else {
          // Corner connection - use smaller base
          const cornerBaseSize = triangleWidth * 0.5; // Smaller base for corners
          base1Lat = attachLat + perpY * cornerBaseSize + ny * extendIntoBubble;
          base1Lng = attachLng + perpX * cornerBaseSize + nx * extendIntoBubble;
          base2Lat = attachLat - perpY * cornerBaseSize + ny * extendIntoBubble;
          base2Lng = attachLng - perpX * cornerBaseSize + nx * extendIntoBubble;
        }

        polygonRef.current.setPaths([
          { lat: tipLat, lng: tipLng },
          { lat: base1Lat, lng: base1Lng },
          { lat: base2Lat, lng: base2Lng },
        ]);
      }
    }
  }, [
    bubblePosition.lat,
    bubblePosition.lng,
    markerPosition.lat,
    markerPosition.lng,
  ]);

  return null;
};

// Map wrapper component
function MapWrapper({
  children,
  onMapLoad,
}: {
  children: React.ReactNode;
  onMapLoad: (map: google.maps.Map) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (map) {
      onMapLoad(map);
    }
  }, [map, onMapLoad]);

  return <>{children}</>;
}

// Main component
export default function CompMapBubble() {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapCenter = properties[0]?.position;
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [bubblePositions, setBubblePositions] = useState<
    Record<number, { lat: number; lng: number }>
  >({});
  const [bubbleSizes, setBubbleSizes] = useState<
    Record<number, { width: number; height: number }>
  >({});

  return (
    <APIProvider apiKey={apiKey}>
      <div style={{ height: "100vh", width: "100%", position: "relative" }}>
        <Map
          defaultCenter={mapCenter}
          defaultZoom={13}
          mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
          gestureHandling="cooperative"
        >
          <MapWrapper onMapLoad={setMap}>
            {/* Render marker pins */}
            {properties.map((property) => (
              <AdvancedMarker
                key={`marker-${property.id}`}
                position={property.position}
              >
                <Pin
                  background={
                    property.type === "subject" ? "#B40404" : "#007bff"
                  }
                  borderColor={
                    property.type === "subject" ? "#8B0000" : "#0056b3"
                  }
                  glyphColor="#fff"
                />
              </AdvancedMarker>
            ))}

            {/* Render bubbles and tails */}
            {map &&
              properties.map((property) => {
                const currentBubblePosition =
                  bubblePositions[property.id] ?? property.position;
                const bubbleColor =
                  property.type === "subject" ? "#B40404" : "#007bff";

                return (
                  <React.Fragment key={`bubble-${property.id}`}>
                    <CompBubble
                      property={property}
                      position={currentBubblePosition}
                      onDragEnd={(newPosition) => {
                        setBubblePositions((prev) => ({
                          ...prev,
                          [property.id]: newPosition,
                        }));
                      }}
                      markerPosition={property.position}
                      onSizeChange={(id, size) => {
                        setBubbleSizes((prev) => ({ ...prev, [id]: size }));
                      }}
                    />
                    <CompTail
                      id={property.id}
                      bubblePosition={currentBubblePosition}
                      markerPosition={property.position}
                      color={bubbleColor}
                      bubbleSizePx={bubbleSizes[property.id]}
                    />
                  </React.Fragment>
                );
              })}
          </MapWrapper>
        </Map>
      </div>
    </APIProvider>
  );
}
