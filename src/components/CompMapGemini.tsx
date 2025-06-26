"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import { DndContext, useDraggable } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { env } from "~/env";

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
    distance: 18.5,
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
];

// --- Custom Bubble Component ---
const CustomBubble = ({ property }: { property: Property }) => {
  const isSubject = property.type === "subject";
  const bubbleStyle: React.CSSProperties = {
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
    // This transform centers the bubble on its logical point
    transform: "translate(-50%, -115%)",
  };

  const tailStyle: React.CSSProperties = {
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
    <div style={bubbleStyle}>
      <strong>{property.compNumber}</strong>
      <div style={{ fontSize: "12px", marginTop: "5px" }}>
        {property.address}
      </div>
      {property.distance !== undefined && (
        <div style={{ fontSize: "12px", marginTop: "2px" }}>
          {property.distance.toFixed(2)} miles
        </div>
      )}
      <div style={tailStyle}></div>
    </div>
  );
};

// --- DraggableBubblesOverlay Component ---
// This component now handles all the dragging logic and renders bubbles + tails.
function DraggableBubblesOverlay({
  properties,
  bubblePositions,
  setBubblePositions,
  setIsDragging,
}: {
  properties: Property[];
  bubblePositions: { [id: number]: { lat: number; lng: number } };
  setBubblePositions: React.Dispatch<
    React.SetStateAction<{ [id: number]: { lat: number; lng: number } }>
  >;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const map = useMap();
  // We use a state to force re-renders when the projection changes
  const [projection, setProjection] =
    useState<google.maps.MapCanvasProjection | null>(null);

  // Helper function to create the OverlayView instance
  useEffect(() => {
    if (!map) return;
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {};
    overlay.onRemove = () => {};
    // The 'draw' method is called by the Maps API when the map is panned or zoomed.
    // We update our projection state here to trigger a React re-render.
    overlay.draw = () => {
      const proj = overlay.getProjection();
      // Check if the projection has actually changed to avoid unnecessary re-renders
      if (proj) {
        setProjection(proj);
      }
    };
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map]);

  if (!projection) return null;

  const latLngToPixel = (latLng: { lat: number; lng: number }) => {
    return projection.fromLatLngToContainerPixel(
      new google.maps.LatLng(latLng),
    );
  };

  const pixelToLatLng = (pixel: { x: number; y: number }) => {
    const latLng = projection.fromContainerPixelToLatLng(
      new google.maps.Point(pixel.x, pixel.y),
    );
    return { lat: latLng!.lat(), lng: latLng!.lng() };
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    const id = Number(event.active.id);
    const currentPosition =
      bubblePositions[id] || properties.find((p) => p.id === id)!.position;
    const currentPixel = latLngToPixel(currentPosition);

    if (currentPixel) {
      const newPixel = {
        x: currentPixel.x + event.delta.x,
        y: currentPixel.y + event.delta.y,
      };
      const newLatLng = pixelToLatLng(newPixel);
      setBubblePositions((prev) => ({ ...prev, [id]: newLatLng }));
    }
  };

  // The map panes are the layers where you can render custom elements.
  // We use `floatPane` to render our draggable bubbles.
  const mapPanes = map?.getDiv().getElementsByClassName("gm-style")?.[0];
  if (!mapPanes) return null;

  return createPortal(
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {properties.map((prop) => {
        const markerPixel = latLngToPixel(prop.position);
        const bubblePixel = latLngToPixel(
          bubblePositions[prop.id] || prop.position,
        );

        if (!markerPixel || !bubblePixel) return null;

        const getRibbonPoints = (
          start: { x: number; y: number },
          end: { x: number; y: number },
          width: number,
        ) => {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const halfW = width / 2;
          return [
            { x: start.x + nx * halfW, y: start.y + ny * halfW },
            { x: start.x - nx * halfW, y: start.y - ny * halfW },
            { x: end.x - nx * halfW, y: end.y - ny * halfW },
            { x: end.x + nx * halfW, y: end.y + ny * halfW },
          ]
            .map((p) => `${p.x},${p.y}`)
            .join(" ");
        };

        const DraggableBubble = ({ prop }: { prop: Property }) => {
          const { attributes, listeners, setNodeRef, transform } = useDraggable(
            { id: prop.id },
          );
          const style: React.CSSProperties = {
            position: "absolute",
            left: bubblePixel.x,
            top: bubblePixel.y,
            transform: transform
              ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
              : undefined,
            zIndex: 10,
            cursor: "move",
          };
          return (
            <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
              <CustomBubble property={prop} />
            </div>
          );
        };

        return (
          <React.Fragment key={prop.id}>
            <svg
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 5,
              }}
            >
              <polygon
                points={getRibbonPoints(markerPixel, bubblePixel, 12)}
                fill={prop.type === "subject" ? "#c00" : "#0070d2"}
                opacity="0.7"
              />
            </svg>
            <DraggableBubble prop={prop} />
          </React.Fragment>
        );
      })}
    </DndContext>,
    mapPanes,
  );
}

// --- Main App Component ---
export default function CompMap() {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapCenter = properties[0]?.position;
  // State to hold the geographic positions of the bubbles
  const [bubblePositions, setBubblePositions] = useState<{
    [id: number]: { lat: number; lng: number };
  }>({});
  // --- FIX: State to control map dragging ---
  const [isDragging, setIsDragging] = useState(false);

  return (
    <APIProvider apiKey={apiKey}>
      <div style={{ height: "100vh", width: "100%", position: "relative" }}>
        <Map
          defaultCenter={mapCenter}
          defaultZoom={13}
          mapId="comp-map-appraisal"
          disableDefaultUI={true}
          // --- FIX: Dynamically handle map gestures ---
          gestureHandling={isDragging ? "none" : "cooperative"}
        >
          {/* Render the static marker pins */}
          {properties.map((prop) => (
            <AdvancedMarker key={prop.id} position={prop.position}>
              <Pin
                background={prop.type === "subject" ? "#c00" : "#0070d2"}
                borderColor={prop.type === "subject" ? "#a00" : "#00539e"}
                glyphColor={"#fff"}
              />
            </AdvancedMarker>
          ))}
        </Map>
        {/* The overlay handles all the custom bubble rendering and dragging */}
        <DraggableBubblesOverlay
          properties={properties}
          bubblePositions={bubblePositions}
          setBubblePositions={setBubblePositions}
          setIsDragging={setIsDragging}
        />
      </div>
    </APIProvider>
  );
}
