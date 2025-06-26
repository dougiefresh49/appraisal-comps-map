"use client";

import React, { useState } from "react";
import { APIProvider, Map } from "@vis.gl/react-google-maps";
import { MapOverlayPortal } from "../components/MapOverlayPortal";
import { MinimalDraggableBubble } from "../components/CompMap";
import { DndContext } from "@dnd-kit/core";

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
const initialLatLng = { lat: 32.003685, lng: -102.080769 };
const mapCenter = initialLatLng;

export default function HomePage() {
  const [bubbleLatLng, setBubbleLatLng] = useState(initialLatLng);
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

  // DndContext drag handlers
  const handleDragStart = () => {
    setDragStartLatLng(bubbleLatLng);
    setPreviewLatLng(bubbleLatLng);
  };

  const handleDragMove = (
    event: any,
    projection?: google.maps.MapCanvasProjection,
  ) => {
    if (dragStartLatLng && projection) {
      const anchorPx = latLngToPixel(
        projection,
        dragStartLatLng.lat,
        dragStartLatLng.lng,
      );
      const newPx = {
        x: anchorPx.x + event.delta.x,
        y: anchorPx.y + event.delta.y,
      };
      const newLatLng = pixelToLatLng(projection, newPx.x, newPx.y);
      setPreviewLatLng(newLatLng);
    }
  };

  const handleDragEnd = () => {
    if (previewLatLng) setBubbleLatLng(previewLatLng);
    setDragStartLatLng(null);
    setPreviewLatLng(null);
  };

  return (
    <APIProvider apiKey={apiKey}>
      <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
        <DndContext
          onDragStart={handleDragStart}
          onDragMove={() => {}}
          onDragEnd={handleDragEnd}
        >
          <Map
            defaultCenter={mapCenter}
            defaultZoom={13}
            mapId="comp-map-appraisal"
          >
            {/* No markers, just the draggable bubble for this test */}
          </Map>
          <MapOverlayPortal>
            {({ projection }) =>
              projection ? (
                <MinimalDraggableBubble
                  projection={projection}
                  bubbleLatLng={bubbleLatLng}
                  setBubbleLatLng={setBubbleLatLng}
                  dragStartLatLng={dragStartLatLng}
                  setDragStartLatLng={setDragStartLatLng}
                  previewLatLng={previewLatLng}
                  setPreviewLatLng={setPreviewLatLng}
                />
              ) : null
            }
          </MapOverlayPortal>
        </DndContext>
      </div>
    </APIProvider>
  );
}
