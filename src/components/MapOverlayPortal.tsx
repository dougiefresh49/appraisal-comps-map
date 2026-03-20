import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "@vis.gl/react-google-maps";

/**
 * MapOverlayPortal attaches a Google Maps OverlayView to the map and renders children in a portal above the map.
 * It provides the projection and map container for pixel/latlng conversion.
 */
export const MapOverlayPortal: React.FC<{
  children: (ctx: {
    projection: google.maps.MapCanvasProjection | null;
    mapDiv: HTMLDivElement | null;
  }) => React.ReactNode;
}> = ({ children }) => {
  const map = useMap();
  const [projection, setProjection] =
    useState<google.maps.MapCanvasProjection | null>(null);
  const [mapDiv, setMapDiv] = useState<HTMLDivElement | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;
    const overlay = new window.google.maps.OverlayView();
    overlay.onAdd = function () {
      const panes = overlay.getPanes();
      if (panes?.overlayMouseTarget) {
        setMapDiv(panes.overlayMouseTarget.parentElement as HTMLDivElement);
      }
    };
    overlay.draw = function () {
      const proj = overlay.getProjection();
      if (proj && proj !== projection) setProjection(proj);
    };
    overlay.onRemove = function () {
      // Cleanup handled in useEffect return
    };
    overlay.setMap(map);
    overlayRef.current = overlay;
    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
      setProjection(null);
      setMapDiv(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Render children in a portal above the map
  if (!mapDiv) return null;
  return createPortal(children({ projection, mapDiv }), mapDiv);
};
