"use client";

import React, { useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
} from "@vis.gl/react-google-maps";
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

// --- Main App Component ---
export default function CompMap() {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const mapCenter = properties[0]?.position; // Center map on the Subject property

  return (
    <APIProvider apiKey={apiKey}>
      <div style={{ height: "100vh", width: "100%" }}>
        <Map
          defaultCenter={mapCenter}
          defaultZoom={13}
          mapId="comp-map-appraisal" // Optional: for custom cloud styling
        >
          {properties.map((prop) => (
            <AdvancedMarker key={prop.id} position={prop.position}>
              <CustomBubble property={prop} />
            </AdvancedMarker>
          ))}
        </Map>
      </div>
    </APIProvider>
  );
}
