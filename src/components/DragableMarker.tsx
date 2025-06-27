"use client";

import { AdvancedMarker, APIProvider, Map } from "@vis.gl/react-google-maps";
import React, { useState } from "react";
import { env } from "~/env";

function DraggableMarkerMap() {
  const [markerPosition, setMarkerPosition] = useState({
    lat: 34.052235,
    lng: -118.243683,
  }); // Initial position

  const handleDragEnd = (event: any) => {
    const newLat = event.detail.latLng.lat;
    const newLng = event.detail.latLng.lng;
    setMarkerPosition({ lat: newLat, lng: newLng });
    console.log("Marker dragged to:", newLat, newLng);
  };

  return (
    <APIProvider apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
      <div style={{ height: "100vh", width: "100%" }}>
        <Map
          center={markerPosition}
          zoom={10}
          mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} // Required for AdvancedMarker
        >
          <AdvancedMarker
            position={markerPosition}
            draggable
            onDragEnd={handleDragEnd}
          />
        </Map>
      </div>
    </APIProvider>
  );
}

export default DraggableMarkerMap;
