"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
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


// Individual bubble overlay component that creates one overlay per bubble
function BubbleOverlay({
  map,
  property,
  position,
  onDragEnd,
  setIsDragging,
  setDragPositions,
}: {
  map: google.maps.Map;
  property: Property;
  position: { lat: number; lng: number };
  onDragEnd: (newPosition: { lat: number; lng: number }) => void;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  setDragPositions: React.Dispatch<React.SetStateAction<Record<number, { lat: number; lng: number }>>>;
}) {
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const contentCreated = useRef(false);

  useEffect(() => {
    if (!map) return;

    class BubbleOverlayView extends google.maps.OverlayView {
      private div: HTMLDivElement | null = null;
      private position: google.maps.LatLng;
      private contentInitialized = false;

      constructor(position: google.maps.LatLng) {
        super();
        this.position = position;
      }

      onAdd() {
        this.div = document.createElement('div');
        this.div.style.position = 'absolute';
        this.div.style.zIndex = '1000';
        this.div.style.pointerEvents = 'auto';

        const panes = this.getPanes();
        if (panes) {
          panes.overlayMouseTarget.appendChild(this.div);
        }
        
        // Create content immediately when added
        this.createContent();
      }

      createContent() {
        if (!this.div || this.contentInitialized) return;
        this.contentInitialized = true;

        // Create the bubble content directly
        const container = document.createElement('div');
        container.style.position = 'relative';
        container.style.pointerEvents = 'auto';

        // Create bubble element
        const bubbleElement = document.createElement('div');
        bubbleElement.style.position = 'relative';
        bubbleElement.style.background = property.type === 'subject' ? '#c00' : '#0070d2';
        bubbleElement.style.color = 'white';
        bubbleElement.style.padding = '10px 15px';
        bubbleElement.style.borderRadius = '8px';
        bubbleElement.style.width = '200px';
        bubbleElement.style.fontFamily = 'Arial, sans-serif';
        bubbleElement.style.fontSize = '14px';
        bubbleElement.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
        bubbleElement.style.border = `2px solid ${property.type === 'subject' ? '#a00' : '#00539e'}`;
        bubbleElement.style.textAlign = 'center';
        bubbleElement.style.cursor = 'move';

        // Add content
        bubbleElement.innerHTML = `
          <strong>${property.compNumber}</strong>
          <div style="font-size: 12px; margin-top: 5px;">${property.address}</div>
          ${property.distance !== undefined ? `<div style="font-size: 12px; margin-top: 2px;">${property.distance.toFixed(2)} miles</div>` : ''}
        `;

        // Add tail
        const tail = document.createElement('div');
        tail.style.position = 'absolute';
        tail.style.bottom = '-10px';
        tail.style.left = '50%';
        tail.style.transform = 'translateX(-50%)';
        tail.style.width = '0';
        tail.style.height = '0';
        tail.style.borderLeft = '10px solid transparent';
        tail.style.borderRight = '10px solid transparent';
        tail.style.borderTop = `10px solid ${property.type === 'subject' ? '#a00' : '#00539e'}`;
        
        bubbleElement.appendChild(tail);
        container.appendChild(bubbleElement);

        // Add drag functionality with local state - create unique scope for each bubble
        const dragState = {
          startX: 0,
          startY: 0,
          isDragging: false,
          lastMouseX: 0,
          lastMouseY: 0,
          originalPosition: new google.maps.LatLng(this.position.lat(), this.position.lng())
        };

        const handleMouseDown = (e: MouseEvent) => {
          e.preventDefault();
          dragState.isDragging = true;
          setIsDragging(true);
          if (map) map.setOptions({ draggable: false });
          
          dragState.startX = e.clientX;
          dragState.startY = e.clientY;
          dragState.lastMouseX = e.clientX;
          dragState.lastMouseY = e.clientY;
          dragState.originalPosition = new google.maps.LatLng(this.position.lat(), this.position.lng());

          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        };

        const handleMouseMove = (e: MouseEvent) => {
          if (!dragState.isDragging) return;
          dragState.lastMouseX = e.clientX;
          dragState.lastMouseY = e.clientY;
          const deltaX = e.clientX - dragState.startX;
          const deltaY = e.clientY - dragState.startY;
          
          // Update the overlay position immediately for smooth dragging
          const projection = this.getProjection();
          if (projection) {
            const originalPoint = projection.fromLatLngToDivPixel(dragState.originalPosition);
            if (originalPoint && this.div) {
              const newX = originalPoint.x + deltaX;
              const newY = originalPoint.y + deltaY;
              
              this.div.style.left = `${newX}px`;
              this.div.style.top = `${newY}px`;
              
              // Calculate temporary lat/lng for ribbon updates
              const tempLatLng = projection.fromDivPixelToLatLng(
                new google.maps.Point(newX, newY)
              );
              if (tempLatLng) {
                setDragPositions(prev => ({
                  ...prev,
                  [property.id]: { lat: tempLatLng.lat(), lng: tempLatLng.lng() }
                }));
              }
            }
          }
        };

        const handleMouseUp = () => {
          if (!dragState.isDragging) return;
          dragState.isDragging = false;
          setIsDragging(false);
          if (map) map.setOptions({ draggable: true });
          
          // Calculate the final position from the accumulated drag deltas
          const projection = this.getProjection();
          if (projection) {
            const deltaX = dragState.lastMouseX - dragState.startX;
            const deltaY = dragState.lastMouseY - dragState.startY;
            
            const originalPoint = projection.fromLatLngToDivPixel(dragState.originalPosition);
            if (originalPoint) {
              const newX = originalPoint.x + deltaX;
              const newY = originalPoint.y + deltaY;
              
              // Convert final pixel position to lat/lng
              const finalLatLng = projection.fromDivPixelToLatLng(
                new google.maps.Point(newX, newY)
              );
              
              if (finalLatLng) {
                // Update the overlay's internal position
                this.position = finalLatLng;
                // Notify parent component with the final position
                onDragEnd({ lat: finalLatLng.lat(), lng: finalLatLng.lng() });
              }
            }
          }
          
          // Clear drag position
          setDragPositions(prev => {
            const updated = { ...prev };
            delete updated[property.id];
            return updated;
          });

          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          
          // Force a redraw to show the final position
          this.draw();
        };

        container.addEventListener('mousedown', handleMouseDown);
        this.div.appendChild(container);
      }

      draw() {
        if (!this.div) return;
        
        const projection = this.getProjection();
        if (projection) {
          const point = projection.fromLatLngToDivPixel(this.position);
          if (point) {
            this.div.style.left = `${point.x}px`;
            this.div.style.top = `${point.y}px`;
            this.div.style.transform = 'translate(-50%, -100%)';
          }
        }
      }

      onRemove() {
        if (this.div?.parentNode) {
          this.div.parentNode.removeChild(this.div);
        }
      }

      updatePosition(newPosition: google.maps.LatLng) {
        this.position = newPosition;
        this.draw();
      }
    }

    const overlay = new BubbleOverlayView(
      new google.maps.LatLng(position.lat, position.lng)
    );
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
      contentCreated.current = false;
    };
  }, [map, property.id]);

  // Update position when prop changes
  useEffect(() => {
    if (overlayRef.current) {
      (overlayRef.current as any).updatePosition(
        new google.maps.LatLng(position.lat, position.lng)
      );
    }
  }, [position]);

  return null;
}

// Ribbon overlay component for connecting pins to bubbles
function RibbonOverlay({
  map,
  property,
  bubblePosition,
  dragPositions,
}: {
  map: google.maps.Map;
  property: Property;
  bubblePosition: { lat: number; lng: number };
  dragPositions: Record<number, { lat: number; lng: number }>;
}) {
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;

    class RibbonOverlayView extends google.maps.OverlayView {
      private div: HTMLDivElement | null = null;

      onAdd() {
        this.div = document.createElement('div');
        this.div.style.position = 'absolute';
        this.div.style.left = '0';
        this.div.style.top = '0';
        this.div.style.width = '100%';
        this.div.style.height = '100%';
        this.div.style.pointerEvents = 'none';
        this.div.style.zIndex = '500';

        const panes = this.getPanes();
        if (panes) {
          panes.overlayLayer.appendChild(this.div);
        }
      }

      draw() {
        if (!this.div) return;
        
        const projection = this.getProjection();
        if (projection) {
          const markerPoint = projection.fromLatLngToDivPixel(
            new google.maps.LatLng(property.position.lat, property.position.lng)
          );
          
          // Use drag position if bubble is being dragged, otherwise use bubble position
          const currentBubblePosition = dragPositions[property.id] ?? bubblePosition;
          const bubblePoint = projection.fromLatLngToDivPixel(
            new google.maps.LatLng(currentBubblePosition.lat, currentBubblePosition.lng)
          );

          if (markerPoint && bubblePoint) {
            // Clear previous content
            this.div.innerHTML = '';
            
            // Create SVG element
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.position = 'absolute';
            svg.style.left = '0';
            svg.style.top = '0';
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.pointerEvents = 'none';
            svg.style.overflow = 'visible';

            // Create ribbon path
            const ribbon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            
            // Calculate ribbon points
            const dx = bubblePoint.x - markerPoint.x;
            const dy = bubblePoint.y - markerPoint.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const halfW = 6; // ribbon width
            
            const points = [
              { x: markerPoint.x + nx * halfW, y: markerPoint.y + ny * halfW },
              { x: markerPoint.x - nx * halfW, y: markerPoint.y - ny * halfW },
              { x: bubblePoint.x - nx * halfW, y: bubblePoint.y - ny * halfW },
              { x: bubblePoint.x + nx * halfW, y: bubblePoint.y + ny * halfW },
            ];
            
            const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
            ribbon.setAttribute('points', pointsStr);
            ribbon.setAttribute('fill', property.type === 'subject' ? '#c00' : '#0070d2');
            ribbon.setAttribute('opacity', '0.7');
            
            svg.appendChild(ribbon);
            this.div.appendChild(svg);
          }
        }
      }

      onRemove() {
        if (this.div?.parentNode) {
          this.div.parentNode.removeChild(this.div);
        }
      }
    }

    const overlay = new RibbonOverlayView();
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map, property.position.lat, property.position.lng, bubblePosition.lat, bubblePosition.lng, dragPositions]);

  return null;
}

// Map wrapper component to get map reference
function MapWrapper({
  children,
  onMapLoad,
}: {
  children: React.ReactNode;
  onMapLoad: (map: google.maps.Map) => void;
}) {
  const map = useMap();
  
  useEffect(() => {
    if (map) {
      onMapLoad(map);
    }
  }, [map, onMapLoad]);

  return <>{children}</>;
}

// --- Main App Component ---
export default function CompMap() {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapCenter = properties[0]?.position;
  const [map, setMap] = useState<google.maps.Map | null>(null);
  // State to hold the geographic positions of the bubbles
  const [bubblePositions, setBubblePositions] = useState<
    Record<number, { lat: number; lng: number }>
  >({});
  // --- FIX: State to control map dragging ---
  const [isDragging, setIsDragging] = useState(false);
  // Track temporary drag positions for smooth ribbon updates
  const [dragPositions, setDragPositions] = useState<
    Record<number, { lat: number; lng: number }>
  >({});

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
          <MapWrapper onMapLoad={setMap}>
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
            {/* Individual bubble overlays for geographically anchored bubbles */}
            {map && properties.map((property) => (
              <React.Fragment key={property.id}>
                <BubbleOverlay
                  map={map}
                  property={property}
                  position={bubblePositions[property.id] ?? property.position}
                  onDragEnd={(newPosition) => {
                    setBubblePositions((prev) => ({
                      ...prev,
                      [property.id]: newPosition,
                    }));
                  }}
                  setIsDragging={setIsDragging}
                  setDragPositions={setDragPositions}
                />
                <RibbonOverlay
                  map={map}
                  property={property}
                  bubblePosition={bubblePositions[property.id] ?? property.position}
                  dragPositions={dragPositions}
                />
              </React.Fragment>
            ))}
          </MapWrapper>
        </Map>
      </div>
    </APIProvider>
  );
}
