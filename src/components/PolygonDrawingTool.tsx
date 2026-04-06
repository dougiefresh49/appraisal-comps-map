"use client";

import { useEffect, useRef, useState } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

interface PolygonPath {
  lat: number;
  lng: number;
}

interface PolygonDrawingToolProps {
  isDrawing: boolean;
  onIsDrawingChange: (isDrawing: boolean) => void;
  polygonPath: PolygonPath[];
  onPolygonPathChange: (path: PolygonPath[]) => void;
  readOnly?: boolean;
  hideUI?: boolean;
}

export function PolygonDrawingTool({
  isDrawing,
  onIsDrawingChange,
  polygonPath,
  onPolygonPathChange,
  readOnly = false,
  hideUI = false,
}: PolygonDrawingToolProps) {

  const map = useMap();
  const drawingLibrary = useMapsLibrary("drawing");
  const [drawingManager, setDrawingManager] =
    useState<google.maps.drawing.DrawingManager | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);

  // Initialize DrawingManager
  useEffect(() => {
    if (!map || !drawingLibrary) return;

    const manager = new drawingLibrary.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polygonOptions: {
        strokeColor: "#000000",
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: "#FFFF00",
        fillOpacity: 0.35,
        editable: false,
        draggable: false,
      },
    });

    manager.setMap(map);
    setDrawingManager(manager);

    // Listen for polygon complete
    const listener = manager.addListener(
      "polygoncomplete",
      (polygon: google.maps.Polygon) => {
        const path = polygon.getPath();
        const coordinates: PolygonPath[] = [];

        path.forEach((latLng) => {
          coordinates.push({
            lat: latLng.lat(),
            lng: latLng.lng(),
          });
        });

        onPolygonPathChange(coordinates);
        polygon.setMap(null); // Remove the temporary polygon
        manager.setDrawingMode(null);
        onIsDrawingChange(false);
      },
    );

    return () => {
      google.maps.event.removeListener(listener);
      manager.setMap(null);
    };
  }, [map, drawingLibrary, onPolygonPathChange, onIsDrawingChange]);

  // Handle drawing mode changes
  useEffect(() => {
    if (!drawingManager) return;

    if (isDrawing && !readOnly) {
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    } else {
      drawingManager.setDrawingMode(null);
    }
  }, [isDrawing, drawingManager, readOnly]);

  // Render polygon from path
  useEffect(() => {
    if (!map || polygonPath.length < 3) {
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
        polygonRef.current = null;
      }
      return;
    }

    const polygon = new google.maps.Polygon({
      paths: polygonPath.map((p) => new google.maps.LatLng(p.lat, p.lng)),
      strokeColor: "#000000",
      strokeOpacity: 1,
      strokeWeight: 3,
      fillColor: "#FFFF00",
      fillOpacity: 0.35,
      editable: !isDrawing && !readOnly && !hideUI,
      draggable: !isDrawing && !readOnly && !hideUI,
    });

    polygon.setMap(map);
    polygonRef.current = polygon;

    // Event listeners to sync state
    const syncPath = () => {
      const path = polygon.getPath();
      const coordinates: PolygonPath[] = [];
      path.forEach((latLng) => {
        coordinates.push({
          lat: latLng.lat(),
          lng: latLng.lng(),
        });
      });
      onPolygonPathChange(coordinates);
    };

    const listeners = [
      polygon.addListener("mouseup", syncPath),
      polygon.addListener("dragend", syncPath),
    ];

    const path = polygon.getPath();
    listeners.push(path.addListener("insert_at", syncPath));
    listeners.push(path.addListener("remove_at", syncPath));
    // Note: We avoid 'set_at' during drag to prevent re-render loops. 'mouseup' handles the final position.

    return () => {
      listeners.forEach((listener) => google.maps.event.removeListener(listener));
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
        polygonRef.current = null;
      }
    };
  }, [map, polygonPath, isDrawing, onPolygonPathChange, readOnly, hideUI]);

  return null;
}
