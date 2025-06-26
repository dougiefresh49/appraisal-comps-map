"use client";

import React, { useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import { env } from "~/env";
import { MapOverlayPortal } from "./MapOverlayPortal";
import { DndContext, useDraggable } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";

// --- Hardcoded Data based on your previous input ---
// In a real app, you would fetch this data from an API or your n8n workflow.

type Property = {
  type: "subject" | "comp";
  id: number;
  position: { lat: number; lng: number };
  address: string;
  compNumber: string;
  distance?: number;
};

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
    distance: 18.5, // Example distance in miles
  },
  {
    type: "comp",
    id: 2,
    position: { lat: 32.001695, lng: -102.07947 },
    address: "507 N. Marienfeld, Midland, TX 79701",
    compNumber: "COMPARABLE No. 2",
    distance: 0.2,
  },
  {
    type: "comp",
    id: 3,
    position: { lat: 32.015752, lng: -102.141736 },
    address: "4409 W Wadley Ave, Midland, TX 79707",
    compNumber: "COMPARABLE No. 3",
    distance: 4.5,
  },
  {
    type: "comp",
    id: 4,
    position: { lat: 32.032372, lng: -102.146854 },
    address: "4715 N Midland Dr, Midland, TX 79707-3381",
    compNumber: "COMPARABLE No. 4",
    distance: 5.8,
  },
  {
    type: "comp",
    id: 5,
    position: { lat: 32.003646, lng: -102.081992 },
    address: "700 W Louisiana Ave, Midland, TX 79701-3249",
    compNumber: "COMPARABLE No. 5",
    distance: 0.1,
  },
  // Note: The Plano address is very far away, so I've excluded it for a better default map view.
];

// --- Custom Bubble Component ---
// This is the styled "bubble" that looks like your Total a la Mode example.
const CustomBubble = ({ property }: { property: Property }) => {
  const isSubject = property.type === "subject";
  const bubbleStyle = {
    position: "relative",
    background: isSubject ? "#c00" : "#0070d2",
    color: "white",
    padding: "10px 15px",
    borderRadius: "8px",
    width: "200px",
    fontFamily: "Arial, sans-serif",
    fontSize: "14px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
    border: `2px solid ${isSubject ? "#a00" : "#00539e"}`,
    textAlign: "center",
    // Position the bubble above the marker point
    transform: "translate(-50%, -125%)",
  };

  const tailStyle = {
    content: '""',
    position: "absolute",
    bottom: "-10px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "0",
    height: "0",
    borderLeft: "10px solid transparent",
    borderRight: "10px solid transparent",
    borderTop: `10px solid ${isSubject ? "#a00" : "#00539e"}`,
  };

  return (
    <div style={bubbleStyle as React.CSSProperties}>
      <strong>{property.compNumber}</strong>
      <div style={{ fontSize: "12px", marginTop: "5px" }}>
        {property.address}
      </div>
      {property.distance !== undefined && (
        <div style={{ fontSize: "12px", marginTop: "2px" }}>
          {property.distance.toFixed(2)} miles
        </div>
      )}
      <div style={tailStyle as React.CSSProperties}></div>
    </div>
  );
};

// DnD-kit draggable bubble (moved outside CompMap to follow Rules of Hooks)
function DraggableBubble({
  prop,
  markerPx,
  offset,
  isActive,
  dragDelta,
}: {
  prop: Property;
  markerPx: { x: number; y: number };
  offset: { x: number; y: number };
  isActive: boolean;
  dragDelta: { x: number; y: number };
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: prop.id });
  const x = markerPx.x + offset.x + (isActive ? dragDelta.x : 0);
  const y = markerPx.y + offset.y + (isActive ? dragDelta.y : 0);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 10,
        cursor: "move",
        touchAction: "none",
      }}
    >
      <CustomBubble property={prop} />
    </div>
  );
}

// DraggableBubblesOverlay: handles all drag logic and rendering
function DraggableBubblesOverlay({
  projection,
  mapDiv,
  properties,
  bubblePositions,
  setBubblePositions,
}: {
  projection: google.maps.MapCanvasProjection;
  mapDiv: HTMLDivElement;
  properties: Property[];
  bubblePositions: { [id: number]: { lat: number; lng: number } };
  setBubblePositions: React.Dispatch<
    React.SetStateAction<{ [id: number]: { lat: number; lng: number } }>
  >;
}) {
  const map = useMap();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dragStartLatLng, setDragStartLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [previewLatLng, setPreviewLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Helper: Convert lat/lng to pixel using projection
  const latLngToPixel = (
    projection: google.maps.MapCanvasProjection,
    lat: number,
    lng: number,
  ): { x: number; y: number } => {
    const point = projection.fromLatLngToDivPixel(
      new window.google.maps.LatLng(lat, lng),
    );
    if (!point) return { x: 0, y: 0 };
    return { x: point.x, y: point.y };
  };

  // Helper: Convert pixel to lat/lng using projection
  const pixelToLatLng = (
    projection: google.maps.MapCanvasProjection,
    x: number,
    y: number,
  ): { lat: number; lng: number } => {
    const latLng = projection.fromDivPixelToLatLng(
      new window.google.maps.Point(x, y),
    );
    if (!latLng) return { lat: 0, lng: 0 };
    return { lat: latLng.lat(), lng: latLng.lng() };
  };

  // Helper: Get perpendicular offset points for ribbon tail
  function getRibbonPoints(
    start: { x: number; y: number },
    end: { x: number; y: number },
    width: number,
  ) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const halfW = width / 2;
    // Two points at start, two at end
    return [
      { x: start.x + nx * halfW, y: start.y + ny * halfW },
      { x: start.x - nx * halfW, y: start.y - ny * halfW },
      { x: end.x - nx * halfW, y: end.y - ny * halfW },
      { x: end.x + nx * halfW, y: end.y + ny * halfW },
    ];
  }

  return (
    <DndContext
      onDragStart={(event) => {
        setActiveId(Number(event.active.id));
        // Store the bubble's lat/lng at drag start
        const prop = properties.find((p) => p.id === Number(event.active.id));
        if (prop) {
          const latLng = bubblePositions[prop.id] || prop.position;
          setDragStartLatLng(latLng);
          setPreviewLatLng(latLng);
        }
        if (map) map.setOptions({ draggable: false });
      }}
      onDragMove={(event) => {
        // Calculate previewLatLng from dragStartLatLng + drag delta
        if (dragStartLatLng) {
          const markerPx = latLngToPixel(
            projection,
            dragStartLatLng.lat,
            dragStartLatLng.lng,
          );
          const newPx = {
            x: markerPx.x + (event.delta?.x ?? 0),
            y: markerPx.y + (event.delta?.y ?? 0),
          };
          const newLatLng = pixelToLatLng(projection, newPx.x, newPx.y);
          setPreviewLatLng(newLatLng);
        }
      }}
      onDragEnd={() => {
        if (activeId !== null && previewLatLng) {
          setBubblePositions((prev) => ({
            ...prev,
            [activeId]: previewLatLng,
          }));
        }
        setActiveId(null);
        setDragStartLatLng(null);
        setPreviewLatLng(null);
        if (map) map.setOptions({ draggable: true });
      }}
    >
      {properties.map((prop) => {
        // Use previewLatLng if dragging this bubble, otherwise use stored lat/lng
        const isActive = activeId === prop.id;
        const bubbleLatLng =
          isActive && previewLatLng
            ? previewLatLng
            : bubblePositions[prop.id] || prop.position;
        const markerPx = latLngToPixel(
          projection,
          prop.position.lat,
          prop.position.lng,
        );
        const bubblePx = latLngToPixel(
          projection,
          bubbleLatLng.lat,
          bubbleLatLng.lng,
        );
        // Ribbon tail points
        const ribbonWidth = 12;
        const points = getRibbonPoints(markerPx, bubblePx, ribbonWidth)
          .map((p) => `${p.x},${p.y}`)
          .join(" ");
        return (
          <React.Fragment key={prop.id}>
            {/* Ribbon Tail SVG */}
            <svg
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            >
              <polygon
                points={points}
                fill={prop.type === "subject" ? "#a00" : "#00539e"}
                opacity={0.7}
              />
            </svg>
            {/* Draggable Bubble */}
            <DraggableBubble
              prop={prop}
              markerPx={markerPx}
              offset={{
                x: bubblePx.x - markerPx.x,
                y: bubblePx.y - markerPx.y,
              }}
              isActive={isActive}
              dragDelta={{ x: 0, y: 0 }}
            />
          </React.Fragment>
        );
      })}
    </DndContext>
  );
}

// Minimal single-bubble draggable example for debugging
export function MinimalDraggableBubble({
  projection,
  bubbleLatLng,
  setBubbleLatLng,
  dragStartLatLng,
  setDragStartLatLng,
  previewLatLng,
  setPreviewLatLng,
}: {
  projection: google.maps.MapCanvasProjection;
  bubbleLatLng: { lat: number; lng: number };
  setBubbleLatLng: React.Dispatch<
    React.SetStateAction<{ lat: number; lng: number }>
  >;
  dragStartLatLng: { lat: number; lng: number } | null;
  setDragStartLatLng: React.Dispatch<
    React.SetStateAction<{ lat: number; lng: number } | null>
  >;
  previewLatLng: { lat: number; lng: number } | null;
  setPreviewLatLng: React.Dispatch<
    React.SetStateAction<{ lat: number; lng: number } | null>
  >;
}) {
  const map = useMap();
  const [dragging, setDragging] = React.useState(false);
  const [mapRect, setMapRect] = React.useState<DOMRect | null>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);

  // Helper: Convert lat/lng to pixel using projection
  const latLngToPixel = (
    lat: number,
    lng: number,
  ): { x: number; y: number } => {
    const point = projection.fromLatLngToDivPixel(
      new window.google.maps.LatLng(lat, lng),
    );
    if (!point) return { x: 0, y: 0 };
    return { x: point.x, y: point.y };
  };

  // Helper: Convert pixel to lat/lng using projection
  const pixelToLatLng = (
    x: number,
    y: number,
  ): { lat: number; lng: number } => {
    const latLng = projection.fromDivPixelToLatLng(
      new window.google.maps.Point(x, y),
    );
    if (!latLng) return { lat: 0, lng: 0 };
    return { lat: latLng.lat(), lng: latLng.lng() };
  };

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (overlayRef.current) {
      setMapRect(overlayRef.current.getBoundingClientRect());
    }
    setDragging(true);
    if (map) map.setOptions({ draggable: false });
    (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !mapRect) return;
    // Get pointer position relative to map overlay
    const x = e.clientX - mapRect.left;
    const y = e.clientY - mapRect.top;
    // Convert to lat/lng
    const newLatLng = pixelToLatLng(x, y);
    setPreviewLatLng(newLatLng);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging && previewLatLng) {
      setBubbleLatLng(previewLatLng);
    }
    setDragging(false);
    setMapRect(null);
    setPreviewLatLng(null);
    if (map) map.setOptions({ draggable: true });
    (e.target as HTMLDivElement).releasePointerCapture(e.pointerId);
  };

  // Always render at previewLatLng if dragging, else bubbleLatLng
  const latLng = dragging && previewLatLng ? previewLatLng : bubbleLatLng;
  const px = latLngToPixel(latLng.lat, latLng.lng);
  return (
    <div
      ref={overlayRef}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: px.x,
          top: px.y,
          zIndex: 10,
          cursor: dragging ? "grabbing" : "grab",
          background: "#0070d2",
          color: "white",
          padding: "10px 15px",
          borderRadius: "8px",
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
          border: `2px solid #00539e`,
          textAlign: "center",
          transform: "translate(-50%, -125%)",
          userSelect: "none",
          touchAction: "none", // Important for mobile!
          pointerEvents: "auto",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <strong>DRAG ME</strong>
        <div style={{ fontSize: "12px", marginTop: "5px" }}>
          {latLng.lat.toFixed(5)}, {latLng.lng.toFixed(5)}
        </div>
      </div>
    </div>
  );
}

// Usage in a test page/component:
// <APIProvider apiKey={apiKey}>
//   <Map ...>
//     <MinimalDraggableBubble projection={projection} initialLatLng={{ lat: ..., lng: ... }} />
//   </Map>
// </APIProvider>

// --- Main App Component ---
export default function CompMap() {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapCenter = properties[0]?.position;
  // Store bubble positions as lat/lng, not pixel offsets
  const [bubblePositions, setBubblePositions] = useState<{
    [id: number]: { lat: number; lng: number };
  }>({});

  return (
    <APIProvider apiKey={apiKey}>
      <div style={{ height: "100vh", width: "100%", position: "relative" }}>
        <Map
          defaultCenter={mapCenter}
          defaultZoom={13}
          mapId="comp-map-appraisal"
        >
          {properties.map((prop) => (
            <AdvancedMarker key={prop.id} position={prop.position}>
              <Pin />
            </AdvancedMarker>
          ))}
        </Map>
        {/* Overlay for draggable bubbles and tails */}
        <MapOverlayPortal>
          {({ projection, mapDiv }) => {
            if (!projection || !mapDiv) return null;
            return (
              <DraggableBubblesOverlay
                projection={projection}
                mapDiv={mapDiv}
                properties={properties}
                bubblePositions={bubblePositions}
                setBubblePositions={setBubblePositions}
              />
            );
          }}
        </MapOverlayPortal>
      </div>
    </APIProvider>
  );
}
