"use client";

import { useEffect, useRef, useState } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

interface PolygonPath {
  lat: number;
  lng: number;
}

interface Polyline {
  id: string;
  path: PolygonPath[];
}

interface PolylineDrawingToolProps {
  isDrawing: boolean;
  onIsDrawingChange: (isDrawing: boolean) => void;
  polylines: Polyline[];
  onPolylinesChange: (polylines: Polyline[]) => void;
}

export function PolylineDrawingTool({
  isDrawing,
  onIsDrawingChange,
  polylines,
  onPolylinesChange,
}: PolylineDrawingToolProps) {
  const map = useMap();
  const drawingLibrary = useMapsLibrary("drawing");
  const [drawingManager, setDrawingManager] =
    useState<google.maps.drawing.DrawingManager | null>(null);
  const polylineRefs = useRef<Map<string, google.maps.Polyline>>(new Map());

  // Initialize DrawingManager
  useEffect(() => {
    if (!map || !drawingLibrary) return;

    const manager = new drawingLibrary.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polylineOptions: {
        strokeColor: "#000000",
        strokeOpacity: 1,
        strokeWeight: 3,
        editable: false,
        draggable: false,
      },
    });

    manager.setMap(map);
    setDrawingManager(manager);

    // Listen for polyline complete
    const listener = manager.addListener(
      "polylinecomplete",
      (polyline: google.maps.Polyline) => {
        const path = polyline.getPath();
        const coordinates: PolygonPath[] = [];

        path.forEach((latLng) => {
          coordinates.push({
            lat: latLng.lat(),
            lng: latLng.lng(),
          });
        });

        // Create new polyline with unique ID
        const newPolyline: Polyline = {
          id: `polyline-${Date.now()}-${Math.random()}`,
          path: coordinates,
        };

        onPolylinesChange([...polylines, newPolyline]);
        polyline.setMap(null); // Remove the temporary polyline
        manager.setDrawingMode(null);
        onIsDrawingChange(false);
      },
    );

    return () => {
      google.maps.event.removeListener(listener);
      manager.setMap(null);
    };
  }, [map, drawingLibrary, polylines, onPolylinesChange, onIsDrawingChange]);

  // Handle drawing mode changes
  useEffect(() => {
    if (!drawingManager) return;

    if (isDrawing) {
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYLINE);
    } else {
      drawingManager.setDrawingMode(null);
    }
  }, [isDrawing, drawingManager]);

  // Render polylines from state
  useEffect(() => {
    if (!map) return;

    // Clear existing polylines
    polylineRefs.current.forEach((polyline) => {
      polyline.setMap(null);
    });
    polylineRefs.current.clear();

    // Render all polylines
    polylines.forEach((polyline) => {
      if (polyline.path.length < 2) return;

      const googlePolyline = new google.maps.Polyline({
        path: polyline.path.map((p) => new google.maps.LatLng(p.lat, p.lng)),
        strokeColor: "#000000",
        strokeOpacity: 1,
        strokeWeight: 3,
        editable: false,
        draggable: false,
      });

      googlePolyline.setMap(map);
      polylineRefs.current.set(polyline.id, googlePolyline);
    });

    return () => {
      polylineRefs.current.forEach((polyline) => {
        polyline.setMap(null);
      });
      polylineRefs.current.clear();
    };
  }, [map, polylines]);

  return null;
}

