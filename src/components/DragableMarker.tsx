"use client";

import {
  AdvancedMarker,
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { env } from "~/env";

/**
 * Notes:
 * In total, if the bubble is above or below the anchor, the pointer will attach to either left corner, center, or right corner. based on which point is closer
 */

function LeaderLineMarker({
  anchorPosition,
  title,
  address,
  color = "#B40404",
  distance,
}: {
  anchorPosition: { lat: number; lng: number };
  title: string;
  address: string;
  color?: string;
  distance?: string;
}) {
  // State to hold the position of the draggable bubble
  const [bubblePosition, setBubblePosition] = useState(anchorPosition);
  const [isMounted, setIsMounted] = useState(false);

  // Refs to the map, maps library, polygon, and bubble element
  const map = useMap();
  const mapsLib = useMapsLibrary("maps");
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Effect to handle initial mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Callback to update the polygon shape
  const updatePolygon = useCallback(() => {
    if (!map || !mapsLib || !bubbleRef.current || !isMounted) return;

    const projection = map.getProjection();
    if (!projection) return;

    const bubbleDiv = bubbleRef.current;
    const bubbleWidth = bubbleDiv.offsetWidth;
    const bubbleHeight = bubbleDiv.offsetHeight;

    const bubbleLatLng = new google.maps.LatLng(bubblePosition);
    const anchorLatLng = new google.maps.LatLng(anchorPosition);

    const bubblePoint = projection.fromLatLngToPoint(bubbleLatLng);
    const anchorPoint = projection.fromLatLngToPoint(anchorLatLng);

    if (!bubblePoint || !anchorPoint) return;

    const scale = Math.pow(2, map.getZoom()!);
    const halfWidthWorld = bubbleWidth / 2 / scale;
    const halfHeightWorld = bubbleHeight / 2 / scale;

    const dx = anchorPoint.x - bubblePoint.x;
    const dy = anchorPoint.y - bubblePoint.y;

    let p1: google.maps.Point, p2: google.maps.Point;
    const pointerWidthRatio = 0.3; // Controls the width of the pointer base, 30% of the side

    // Normalize the direction vector by the bubble's dimensions to get the correct side.
    if (Math.abs(dx) / halfWidthWorld > Math.abs(dy) / halfHeightWorld) {
      // Connect to left or right side
      const pointerHeight = halfHeightWorld * pointerWidthRatio;
      const y1 = bubblePoint.y - pointerHeight;
      const y2 = bubblePoint.y + pointerHeight;
      if (dx > 0) {
        // Anchor is to the right, connect to right side
        p1 = new google.maps.Point(bubblePoint.x + halfWidthWorld, y1);
        p2 = new google.maps.Point(bubblePoint.x + halfWidthWorld, y2);
      } else {
        // Anchor is to the left, connect to left side
        p1 = new google.maps.Point(bubblePoint.x - halfWidthWorld, y1);
        p2 = new google.maps.Point(bubblePoint.x - halfWidthWorld, y2);
      }
    } else {
      // Connect to top or bottom side
      const pointerWidth = halfWidthWorld * pointerWidthRatio;
      const x1 = bubblePoint.x - pointerWidth;
      const x2 = bubblePoint.x + pointerWidth;
      if (dy < 0) {
        // Anchor is above, connect to top side
        p1 = new google.maps.Point(x1, bubblePoint.y - halfHeightWorld);
        p2 = new google.maps.Point(x2, bubblePoint.y - halfHeightWorld);
      } else {
        // Anchor is below, connect to bottom side
        p1 = new google.maps.Point(x1, bubblePoint.y + halfHeightWorld);
        p2 = new google.maps.Point(x2, bubblePoint.y + halfHeightWorld);
      }
    }

    const v2 = projection.fromPointToLatLng(p1);
    const v3 = projection.fromPointToLatLng(p2);

    if (!v2 || !v3) return;

    const path = [anchorLatLng, v2, v3];

    if (!polygonRef.current) {
      polygonRef.current = new mapsLib.Polygon({
        paths: path,
        strokeColor: color,
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: color,
        fillOpacity: 0.3,
        map: map,
        zIndex: -1,
      });
    } else {
      polygonRef.current.setPaths(path);
    }
  }, [map, mapsLib, anchorPosition, bubblePosition, color, isMounted]);

  // Effect to draw and update the leader line (Polygon)
  useEffect(() => {
    updatePolygon();

    if (!map) return;
    const listener = map.addListener("bounds_changed", updatePolygon);
    return () => listener.remove();
  }, [map, updatePolygon]);

  // Effect for cleanup
  useEffect(() => {
    return () => {
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
      }
    };
  }, []);

  const handleDragEnd = (event: google.maps.MapMouseEvent) => {
    const newPos = {
      lat: event.latLng?.lat() ?? 0,
      lng: event.latLng?.lng() ?? 0,
    };
    setBubblePosition(newPos);
  };

  return (
    <>
      <AdvancedMarker
        position={bubblePosition}
        draggable
        onDragEnd={handleDragEnd}
        zIndex={10}
      >
        <div
          ref={bubbleRef}
          style={{
            background: "white",
            padding: "8px 12px",
            borderRadius: "8px",
            boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
            border: `2px solid ${color}`,
            textAlign: "center",
            width: "max-content",
            cursor: "move",
            color: "black",
          }}
        >
          <strong style={{ display: "block" }}>{title}</strong>
          <span>{address}</span>
          {distance && <div style={{ fontSize: "0.9em" }}>{distance}</div>}
        </div>
      </AdvancedMarker>

      {/* Static Anchor Marker */}
      <AdvancedMarker position={anchorPosition}>
        <div
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: color,
            border: "2px solid white",
            boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
          }}
        ></div>
      </AdvancedMarker>
    </>
  );
}

/**
 * The main map component that demonstrates the LeaderLineMarker.
 */
function DraggableMarkerMap() {
  const mapCenter = { lat: 34.052235, lng: -118.243683 };

  return (
    <APIProvider apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
      <div style={{ height: "100vh", width: "100%" }}>
        <Map
          defaultCenter={mapCenter}
          defaultZoom={12}
          mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
          gestureHandling="cooperative" // Recommended for better user experience
        >
          <LeaderLineMarker
            anchorPosition={{ lat: 34.0225, lng: -118.284 }} // Adjusted subject position
            title="SUBJECT"
            address="1604 S Burleson Ave"
            color="#B40404"
          />
          <LeaderLineMarker
            anchorPosition={{ lat: 34.08, lng: -118.3 }}
            title="COMPARABLE No. 1"
            address="111 3rd"
            distance="0.28 miles"
            color="#007bff"
          />
          <LeaderLineMarker
            anchorPosition={{ lat: 34.09, lng: -118.25 }}
            title="COMPARABLE No. 4"
            address="207 S Burleson Ave"
            distance="0.33 miles"
            color="#007bff"
          />
        </Map>
      </div>
    </APIProvider>
  );
}

export default DraggableMarkerMap;
