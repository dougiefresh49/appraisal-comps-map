"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";

interface Circle {
  center: { lat: number; lng: number };
  radius: number; // in meters
  id: string;
}

interface CircleDrawingToolProps {
  circles: Circle[];
  onCirclesChange: (circles: Circle[]) => void;
}

export function CircleDrawingTool({
  circles,
  onCirclesChange,
}: CircleDrawingToolProps) {
  const map = useMap();
  const circleRefs = useRef<Map<string, google.maps.Circle>>(new Map());

  // Render circles
  useEffect(() => {
    if (!map) return;

    // Remove circles that no longer exist
    circleRefs.current.forEach((circle, id) => {
      if (!circles.find((c) => c.id === id)) {
        circle.setMap(null);
        circleRefs.current.delete(id);
      }
    });

    // Add or update circles
    circles.forEach((circleData) => {
      if (!circleRefs.current.has(circleData.id)) {
        const circle = new google.maps.Circle({
          center: new google.maps.LatLng(
            circleData.center.lat,
            circleData.center.lng,
          ),
          radius: circleData.radius,
          strokeColor: "#000000",
          strokeOpacity: 1,
          strokeWeight: 3,
          fillColor: "#FFFF00",
          fillOpacity: 0.35,
          editable: false,
          draggable: false,
        });

        circle.setMap(map);
        circleRefs.current.set(circleData.id, circle);
      } else {
        // Update existing circle
        const circle = circleRefs.current.get(circleData.id);
        if (circle) {
          circle.setCenter(
            new google.maps.LatLng(
              circleData.center.lat,
              circleData.center.lng,
            ),
          );
          circle.setRadius(circleData.radius);
        }
      }
    });

    return () => {
      // Cleanup is handled by the removal logic above
    };
  }, [map, circles]);

  return null;
}
