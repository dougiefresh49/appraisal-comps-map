"use client";

import { useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";

// Property data
interface Property {
  id: number;
  compNumber: string;
  address: string;
  type: "subject" | "comparable";
  distance?: number;
}

interface Position {
  lat: number;
  lng: number;
}

const properties: Property[] = [
  {
    id: 1,
    compNumber: "Subject",
    address: "360 SE Loop 338, Odessa, TX 79766",
    type: "subject",
  },
  {
    id: 2,
    compNumber: "COMPARABLE No. 1",
    address: "123 Main St, Midland, TX 79701",
    type: "comparable",
    distance: 0.5,
  },
  {
    id: 3,
    compNumber: "COMPARABLE No. 2",
    address: "456 Oak Ave, Midland, TX 79702",
    type: "comparable",
    distance: 0.8,
  },
  {
    id: 4,
    compNumber: "COMPARABLE No. 3",
    address: "789 Pine Dr, Midland, TX 79703",
    type: "comparable",
    distance: 1.2,
  },
  {
    id: 5,
    compNumber: "COMPARABLE No. 5",
    address: "700 W Louisiana Ave, Midland, TX 79701-3249",
    type: "comparable",
    distance: 0.07,
  },
];

// SVG Bubble Component (just the bubble, no tail)
interface SvgBubbleProps {
  property: Property;
  position: Position;
  // markerPosition: Position;
  onDragEnd: (position: Position) => void;
}

const SvgBubble: React.FC<SvgBubbleProps> = ({
  property,
  position,
  // markerPosition,
  onDragEnd,
}) => {
  const isSubject = property.type === "subject";
  const bubbleColor = isSubject ? "#B40404" : "#007bff";
  const borderColor = isSubject ? "#8B0000" : "#0056b3";

  return (
    <AdvancedMarker
      position={position} // Position at the bubble location
      draggable={false} // The marker itself shouldn't be draggable
    >
      <div
        style={{
          cursor: "move",
          width: "220px",
          height: "100px",
          position: "relative",
        }}
      >
        {/* SVG with bubble and tail */}
        <svg
          width="220"
          height="100"
          viewBox="0 0 437 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            position: "relative",
          }}
        >
          {/* Bubble background */}
          <rect
            x="37.5352"
            y="2.5"
            width="396"
            height="194"
            rx="9.5"
            fill="white"
          />

          {/* Bubble border */}
          <rect
            x="37.5352"
            y="2.5"
            width="396"
            height="194"
            rx="9.5"
            stroke={borderColor}
            strokeWidth="5"
            fill="none"
          />
        </svg>

        {/* Content overlay on the bubble */}
        <div
          style={{
            position: "absolute",
            top: "6px",
            left: "25px",
            right: "25px",
            bottom: "6px", // Reduced from 75px to match smaller height
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "8px",
            color: "black",
            fontSize: "12px",
            fontFamily: "Arial, sans-serif",
            textAlign: "left",
            lineHeight: "1.4",
            pointerEvents: "all",
          }}
          onMouseDown={(e) => {
            // Prevent map interaction during bubble drag
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const startLat = position.lat;
            const startLng = position.lng;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              moveEvent.preventDefault();
              moveEvent.stopPropagation();

              const deltaX = moveEvent.clientX - startX;
              const deltaY = moveEvent.clientY - startY;

              // More precise conversion - adjust based on latitude
              const lat = startLat;
              const latInRadians = lat * (Math.PI / 180);
              const meterPerPixel =
                (156543.03392 * Math.cos(latInRadians)) / Math.pow(2, 13); // zoom level 13
              const degreePerMeter = 1 / 111320;
              const degreePerPixel = meterPerPixel * degreePerMeter;

              const latChange = -deltaY * degreePerPixel; // Negative because screen Y is inverted
              const lngChange = deltaX * degreePerPixel;

              const newPosition = {
                lat: startLat + latChange,
                lng: startLng + lngChange,
              };

              onDragEnd(newPosition);
            };

            const handleMouseUp = (upEvent: MouseEvent) => {
              upEvent.preventDefault();
              upEvent.stopPropagation();
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              fontSize: "14px", // Slightly smaller
              marginBottom: "2px",
              color: bubbleColor,
            }}
          >
            {property.compNumber}
          </div>
          <div
            style={{
              fontSize: "10px", // Smaller
              marginBottom: "1px",
            }}
          >
            {property.address}
          </div>
          {property.distance !== undefined && (
            <div
              style={{
                fontSize: "10px", // Smaller
                fontWeight: "bold",
                color: bubbleColor,
              }}
            >
              {property.distance.toFixed(2)} miles
            </div>
          )}
        </div>
      </div>
    </AdvancedMarker>
  );
};

// Tail component positioned at marker location
interface TailProps {
  bubblePosition: Position;
  markerPosition: Position;
  color: string;
  compNumber: string;
}

const TailAtMarker: React.FC<TailProps> = ({
  bubblePosition,
  markerPosition,
  color,
  compNumber,
}) => {
  const map = useMap();

  const calculateTailPath = () => {
    if (!map) return "";

    const proj = map.getProjection();
    if (!proj) return "";

    // Convert positions to pixel coordinates to get direction
    const bubblePoint = proj.fromLatLngToPoint(
      new google.maps.LatLng(bubblePosition.lat, bubblePosition.lng),
    );
    const markerPoint = proj.fromLatLngToPoint(
      new google.maps.LatLng(markerPosition.lat, markerPosition.lng),
    );

    if (!bubblePoint || !markerPoint) return "";

    // Calculate direction from marker to bubble (this is correct)
    const deltaX = bubblePoint.x - markerPoint.x;
    const deltaY = bubblePoint.y - markerPoint.y;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance === 0) return "";

    // Normalize direction - this points FROM marker TO bubble (which is what we want)
    const dirX = deltaX / distance;
    const dirY = deltaY / distance;

    // Calculate actual distance in pixel coordinates
    const mapZoom = map.getZoom() ?? 13;
    const zoomScale = Math.pow(2, mapZoom);
    const pixelDistance = distance * zoomScale;

    // Convert to our SVG coordinate system with more precise length calculation
    // const svgScale = 1; // Use 1:1 scale for accurate distance
    // Reduce extra length since bubbles are now smaller (100px height)
    // const extraLength = 50; // Smaller extra length to avoid overshooting
    // const tailLength = Math.min(pixelDistance / svgScale + extraLength, 500); // Reduced cap for better proportions
    const tailLength = pixelDistance;

    // Create triangle pointing toward bubble
    // Tip is at (0,0) in our local coordinate system (the marker position)
    const tipX = 0;
    const tipY = 0;

    // Base of triangle extends toward the bubble at the calculated distance
    const baseWidth = 25; // Width of triangle base

    // Calculate where the tail direction intersects the bubble's edge
    // We need to use the actual SVG coordinate system dimensions, not the physical pixel dimensions
    // SVG viewBox is "0 0 437 200" and the rectangle is 396x194, so we need to scale accordingly
    const svgScaleX = 437 / 220; // viewBox width / physical width
    // const svgScaleY = 200 / 100; // viewBox height / physical height
    const bubbleWidthInSvg = 396; // Actual rectangle width in SVG coordinates
    const bubbleHeightInSvg = 194; // Actual rectangle height in SVG coordinates

    // Work directly in SVG coordinates
    // The bubble center in SVG coordinates (where we want the tail to point)
    const bubbleOffsetX = 37.5352;
    const bubbleOffsetY = 2.5;
    const bubbleCenterXInSvg = bubbleOffsetX + bubbleWidthInSvg / 2; // Center of the actual rectangle (235.5352)
    const bubbleCenterYInSvg = bubbleOffsetY + bubbleHeightInSvg / 2; // Center of the actual rectangle (99.5)

    // Use the actual direction from the Google Maps calculation (from marker to bubble)
    // dirX and dirY already point from marker to bubble, which is what we want
    const normalizedDir = {
      x: dirX,
      y: dirY,
    };

    // Calculate where the bubble would be in SVG coordinates based on the direction and distance
    // Use a more reasonable scaling to keep within SVG bounds
    const maxTailLengthInSvg = Math.min(tailLength * svgScaleX, 300); // Cap at 300 SVG units
    const bubbleCenterInTailCoords = {
      x: tipX + dirX * maxTailLengthInSvg,
      y: tipY + dirY * maxTailLengthInSvg,
    };

    // Calculate the bubble's edges in SVG coordinates
    const bubbleLeft = bubbleOffsetX;
    const bubbleRight = bubbleOffsetX + bubbleWidthInSvg;
    const bubbleTop = bubbleOffsetY;
    const bubbleBottom = bubbleOffsetY + bubbleHeightInSvg;

    // Find which edge to connect to based on direction
    let edgeX: number, edgeY: number;

    // Calculate the bubble's position relative to its static SVG center
    const bubbleOffsetFromCenter = {
      x: bubbleCenterInTailCoords.x - bubbleCenterXInSvg,
      y: bubbleCenterInTailCoords.y - bubbleCenterYInSvg,
    };

    // Adjust the bubble edges based on where the bubble actually is
    const actualBubbleLeft = bubbleLeft + bubbleOffsetFromCenter.x;
    const actualBubbleRight = bubbleRight + bubbleOffsetFromCenter.x;
    const actualBubbleTop = bubbleTop + bubbleOffsetFromCenter.y;
    const actualBubbleBottom = bubbleBottom + bubbleOffsetFromCenter.y;
    const actualBubbleCenterX = bubbleCenterXInSvg + bubbleOffsetFromCenter.x;
    const actualBubbleCenterY = bubbleCenterYInSvg + bubbleOffsetFromCenter.y;

    if (Math.abs(normalizedDir.x) > Math.abs(normalizedDir.y)) {
      // Connect to left or right edge
      if (normalizedDir.x > 0) {
        // Bubble is to the right - connect to left edge
        edgeX = actualBubbleLeft;
        edgeY = actualBubbleCenterY;
      } else {
        // Bubble is to the left - connect to right edge
        edgeX = actualBubbleRight;
        edgeY = actualBubbleCenterY;
      }
    } else {
      // Connect to top or bottom edge
      if (normalizedDir.y > 0) {
        // Bubble is below - connect to top edge
        edgeX = actualBubbleCenterX;
        edgeY = actualBubbleTop;
      } else {
        // Bubble is above - connect to bottom edge
        edgeX = actualBubbleCenterX;
        edgeY = actualBubbleBottom;
      }
    }

    // Debug for Comp 1
    if (compNumber === "COMPARABLE No. 1") {
      console.log(`${compNumber} edge detection:`, {
        normalizedDir,
        absX: Math.abs(normalizedDir.x),
        absY: Math.abs(normalizedDir.y),
        horizontalConnection:
          Math.abs(normalizedDir.x) > Math.abs(normalizedDir.y),
        directionRight: normalizedDir.x > 0,
        edgeChoice:
          Math.abs(normalizedDir.x) > Math.abs(normalizedDir.y)
            ? normalizedDir.x > 0
              ? "left edge"
              : "right edge"
            : normalizedDir.y > 0
              ? "top edge"
              : "bottom edge",
        actualBubbleLeft,
        actualBubbleRight,
        actualBubbleCenterY,
        selectedEdgeX: edgeX,
        selectedEdgeY: edgeY,
      });
    }

    // Extend the tail a bit further inside the bubble for better connection
    const extensionDistance = 15; // pixels to extend into the bubble
    const baseX = edgeX + normalizedDir.x * extensionDistance;
    const baseY = edgeY + normalizedDir.y * extensionDistance;

    // Perpendicular vector for triangle width
    const perpX = (-normalizedDir.y * baseWidth) / 2;
    const perpY = (normalizedDir.x * baseWidth) / 2;

    const base1X = baseX + perpX;
    const base1Y = baseY + perpY;
    const base2X = baseX - perpX;
    const base2Y = baseY - perpY;

    // Debug for different bubble positions
    if (compNumber === "COMPARABLE No. 3") {
      // Comp 3
      console.log(`Debug tail for #${compNumber}:`, {
        bubblePoint: { x: bubblePoint.x, y: bubblePoint.y },
        markerPoint: { x: markerPoint.x, y: markerPoint.y },
        deltaX,
        deltaY,
        dirX,
        dirY,
        baseX,
        baseY,
      });
    }

    const result = `M${tipX},${tipY} L${base1X},${base1Y} L${base2X},${base2Y} Z`;

    // Debug logging for tail 1
    if (compNumber === "COMPARABLE No. 1") {
      // Comp 1 position
      console.log(`${compNumber} tail debug:`, {
        distance,
        pixelDistance,
        tailLength,
        deltaX,
        deltaY,
        tipX,
        tipY,
        baseX,
        baseY,
        base1X,
        base1Y,
        base2X,
        base2Y,
        result,
      });
    }

    return result;
  };

  const tailPath = calculateTailPath();

  return (
    <AdvancedMarker position={markerPosition}>
      <div style={{ position: "relative", pointerEvents: "none" }}>
        {/* Debug: Make SVG background visible */}
        <svg
          width="1000"
          height="1000"
          viewBox="-500 -500 1000 1000"
          style={{
            position: "absolute",
            left: "-500px",
            top: "-500px",
            // backgroundColor: "rgba(255,0,0,0.1)", // Temporary debug background
            overflow: "visible",
          }}
        >
          {/* Debug: Add a small circle at center to verify positioning */}
          <circle cx="0" cy="0" r="3" fill="red" opacity="0.5" />

          {tailPath && (
            <path
              d={tailPath}
              fill={color}
              stroke={color}
              strokeWidth="2"
              opacity="0.9"
            />
          )}

          {/* Fallback: simple line if path fails */}
          {!tailPath && (
            <line
              x1="0"
              y1="0"
              x2="50"
              y2="50"
              stroke={color}
              strokeWidth="3"
            />
          )}
        </svg>
      </div>
    </AdvancedMarker>
  );
};

// Red dot marker for the geographic anchor point
interface RedDotProps {
  position: Position;
}

const RedDot: React.FC<RedDotProps> = ({ position }) => {
  return (
    <AdvancedMarker position={position}>
      <div
        style={{
          width: "12px",
          height: "12px",
          borderRadius: "50%",
          backgroundColor: "#ff0000",
          border: "2px solid white",
          boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        }}
      />
    </AdvancedMarker>
  );
};

// Main component
export default function CompMapSvg() {
  // State for bubble positions (initially offset from marker positions)
  const [bubblePositions, setBubblePositions] = useState<
    Record<number, Position>
  >({
    1: { lat: 31.8458, lng: -102.3676 }, // Subject
    2: { lat: 31.8478, lng: -102.3656 }, // Comp 1
    3: { lat: 31.8438, lng: -102.3696 }, // Comp 2
    4: { lat: 31.8418, lng: -102.3636 }, // Comp 3
    5: { lat: 31.8498, lng: -102.3716 }, // Comp 5
  });

  // Fixed marker positions (red dots)
  const markerPositions: Record<number, Position> = {
    1: { lat: 31.8458, lng: -102.3676 }, // Subject marker
    2: { lat: 31.8468, lng: -102.3646 }, // Comp 1 marker
    3: { lat: 31.8428, lng: -102.3686 }, // Comp 2 marker
    4: { lat: 31.8408, lng: -102.3626 }, // Comp 3 marker
    5: { lat: 31.8488, lng: -102.3706 }, // Comp 5 marker
  };

  const handleBubbleDragEnd = (id: number, newPosition: Position) => {
    setBubblePositions((prev) => ({
      ...prev,
      [id]: newPosition,
    }));
  };

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
        <Map
          defaultCenter={{ lat: 31.8458, lng: -102.3676 }}
          defaultZoom={13}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
        >
          {/* Render red dot markers */}
          {properties.map((property) => (
            <RedDot
              key={`marker-${property.id}`}
              position={markerPositions[property.id]!}
            />
          ))}

          {/* Render tails at marker positions */}
          {properties.map((property) => {
            const isSubject = property.type === "subject";
            const borderColor = isSubject ? "#8B0000" : "#0056b3";
            return (
              <TailAtMarker
                key={`tail-${property.id}`}
                bubblePosition={bubblePositions[property.id]!}
                markerPosition={markerPositions[property.id]!}
                color={borderColor}
                compNumber={property.compNumber}
              />
            );
          })}

          {/* Render SVG bubbles */}
          {properties.map((property) => (
            <SvgBubble
              key={`bubble-${property.id}`}
              property={property}
              position={bubblePositions[property.id]!}
              onDragEnd={(newPosition) =>
                handleBubbleDragEnd(property.id, newPosition)
              }
            />
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}
