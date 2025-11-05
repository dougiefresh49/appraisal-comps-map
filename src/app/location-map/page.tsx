"use client";

import { useState, useRef, useEffect } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { env } from "~/env";
import { SubjectLocationMarker } from "~/components/SubjectLocationMarker";
import { PolygonDrawingTool } from "~/components/PolygonDrawingTool";
import { CircleDrawingTool } from "~/components/CircleDrawingTool";
import { PropertyInfoPanel } from "~/components/PropertyInfoPanel";

interface PropertyInfo {
  address: string;
  legalDescription: string;
  acres?: string;
}

interface PolygonPath {
  lat: number;
  lng: number;
}

interface Circle {
  center: { lat: number; lng: number };
  radius: number; // in meters
  id: string;
}

export default function LocationMapPage() {
  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo>({
    address: "",
    legalDescription: "",
    acres: "",
  });
  const [markerPosition, setMarkerPosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [bubblePosition, setBubblePosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [polygonPath, setPolygonPath] = useState<PolygonPath[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingCircle, setIsDrawingCircle] = useState(false);
  const [circleRadius, setCircleRadius] = useState<1 | 2 | 3 | 5>(2); // Default radius in meters
  const [circles, setCircles] = useState<Circle[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: 31.8458,
    lng: -102.3676,
  });
  const [mapZoom, setMapZoom] = useState(17);
  const [bubbleSize, setBubbleSize] = useState(1.0); // 1.0 = 100% (400x200 base)
  const [tailDirection, setTailDirection] = useState<"left" | "right">("right");
  const [hideUI, setHideUI] = useState(false); // Screenshot mode
  const markerPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const bubblePositionRef = useRef<{ lat: number; lng: number } | null>(null);

  // Sync refs with state
  useEffect(() => {
    markerPositionRef.current = markerPosition;
  }, [markerPosition]);

  useEffect(() => {
    bubblePositionRef.current = bubblePosition;
  }, [bubblePosition]);

  // Handle address search
  const handleAddressSearch = async (address: string) => {
    if (!address.trim()) return;

    try {
      const geocoder = new google.maps.Geocoder();
      const results = await new Promise<google.maps.GeocoderResult[]>(
        (resolve, reject) => {
          geocoder.geocode({ address }, (results, status) => {
            if (status === "OK" && results) {
              resolve(results);
            } else {
              reject(new Error(`Geocoding failed: ${status}`));
            }
          });
        },
      );

      if (results && results.length > 0) {
        const location = results[0]!.geometry.location;
        const newPosition = {
          lat: location.lat(),
          lng: location.lng(),
        };
        setMapCenter(newPosition);
        setMarkerPosition(newPosition);
        // Set bubble position slightly offset from marker
        setBubblePosition({
          lat: newPosition.lat + 0.001,
          lng: newPosition.lng + 0.001,
        });
        setMapZoom(18);
      }
    } catch (error) {
      console.error("Error geocoding address:", error);
    }
  };

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar for property information */}
      <PropertyInfoPanel
        propertyInfo={propertyInfo}
        onPropertyInfoChange={setPropertyInfo}
        onAddressSearch={handleAddressSearch}
        bubbleSize={bubbleSize}
        onBubbleSizeChange={setBubbleSize}
        tailDirection={tailDirection}
        onTailDirectionChange={setTailDirection}
        hideUI={hideUI}
        onHideUIChange={setHideUI}
      />

      {/* Map container */}
      <div className="relative flex-1">
        <APIProvider
          apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          libraries={["drawing"]}
        >
          <Map
            center={mapCenter}
            zoom={mapZoom}
            mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
            disableDefaultUI={hideUI}
            onCenterChanged={(e) => {
              const center = e.detail.center;
              if (center) {
                setMapCenter({ lat: center.lat, lng: center.lng });
              }
            }}
            onZoomChanged={(e) => {
              const zoom = e.detail.zoom;
              if (zoom) {
                setMapZoom(zoom);
              }
            }}
            onClick={(e) => {
              if (e.detail.latLng) {
                const lat = e.detail.latLng.lat;
                const lng = e.detail.latLng.lng;

                // If circle drawing mode is active, create a circle
                if (isDrawingCircle) {
                  const newCircle: Circle = {
                    center: { lat, lng },
                    radius: circleRadius * 1609.34, // Convert miles to meters
                    id: `circle-${Date.now()}-${Math.random()}`,
                  };
                  setCircles((prev) => [...prev, newCircle]);
                } else if (isDrawing) {
                  // If polygon drawing mode is active, add point to polygon
                  setPolygonPath((prev) => [...prev, { lat, lng }]);
                } else if (!markerPosition) {
                  // Otherwise, set marker if not set
                  setMarkerPosition({ lat, lng });
                  setBubblePosition({ lat: lat + 0.001, lng: lng + 0.001 });
                }
              }
            }}
          >
            {/* Polygon Drawing Tool */}
            <PolygonDrawingTool
              isDrawing={isDrawing}
              onIsDrawingChange={setIsDrawing}
              polygonPath={polygonPath}
              onPolygonPathChange={setPolygonPath}
            />

            {/* Circle Drawing Tool */}
            <CircleDrawingTool circles={circles} onCirclesChange={setCircles} />

            {/* Subject marker */}
            {markerPosition && !hideUI && (
              <AdvancedMarker
                position={markerPosition}
                draggable
                onDragEnd={(e) => {
                  if (e.latLng) {
                    const newPosition = {
                      lat: e.latLng.lat(),
                      lng: e.latLng.lng(),
                    };

                    // Use refs to get current values synchronously
                    const currentMarkerPos = markerPositionRef.current;
                    const currentBubblePos = bubblePositionRef.current;

                    if (currentMarkerPos && currentBubblePos) {
                      // Calculate offset from current positions
                      const latDiff =
                        currentBubblePos.lat - currentMarkerPos.lat;
                      const lngDiff =
                        currentBubblePos.lng - currentMarkerPos.lng;

                      // Update both positions
                      setMarkerPosition(newPosition);
                      setBubblePosition({
                        lat: newPosition.lat + latDiff,
                        lng: newPosition.lng + lngDiff,
                      });
                    } else {
                      // Fallback if refs aren't set yet
                      setMarkerPosition(newPosition);
                    }
                  }
                }}
              >
                <div className="h-4 w-4 cursor-grab rounded-full border-2 border-white bg-red-600 shadow-lg active:cursor-grabbing" />
              </AdvancedMarker>
            )}

            {/* Custom SVG bubble marker */}
            {bubblePosition && markerPosition && (
              <SubjectLocationMarker
                position={bubblePosition}
                markerPosition={markerPosition}
                propertyInfo={propertyInfo}
                onPositionChange={setBubblePosition}
                sizeMultiplier={bubbleSize}
                tailDirection={tailDirection}
              />
            )}
          </Map>
        </APIProvider>

        {/* Drawing controls */}
        {!hideUI && (
          <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsDrawing(!isDrawing);
                  setIsDrawingCircle(false);
                }}
                className={`rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors ${
                  isDrawing ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
                }`}
                title="Draw a polygon shape"
              >
                {isDrawing ? "Finish Drawing" : "Draw Polygon"}
              </button>
              <div className="relative flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsDrawingCircle(!isDrawingCircle);
                    setIsDrawing(false);
                  }}
                  className={`rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors ${
                    isDrawingCircle
                      ? "border-blue-500 bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                  title="Draw a circle"
                >
                  Draw Circle
                </button>
                {isDrawingCircle && (
                  <select
                    value={circleRadius}
                    onChange={(e) =>
                      setCircleRadius(Number(e.target.value) as 1 | 2 | 3 | 5)
                    }
                    className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm shadow-lg transition-colors hover:bg-gray-50 focus:border-blue-500 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value={1}>1 mile</option>
                    <option value={2}>2 miles</option>
                    <option value={3}>3 miles</option>
                    <option value={5}>5 miles</option>
                  </select>
                )}
              </div>
            </div>
            {polygonPath.length > 0 && (
              <button
                onClick={() => setPolygonPath([])}
                className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors hover:border-red-500 hover:bg-red-50"
              >
                Clear Polygon
              </button>
            )}
            {circles.length > 0 && (
              <button
                onClick={() => setCircles([])}
                className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors hover:border-red-500 hover:bg-red-50"
              >
                Clear Circles
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
