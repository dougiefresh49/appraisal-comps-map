import React from "react";
import type { Circle, PolygonPath } from "~/utils/projectStore";

interface MapDrawingControlsProps {
  isDrawing: boolean;
  onIsDrawingChange: (isDrawing: boolean) => void;
  isDrawingCircle: boolean;
  onIsDrawingCircleChange: (isDrawingCircle: boolean) => void;
  circleRadius: 1 | 2 | 3 | 5;
  onCircleRadiusChange: (radius: 1 | 2 | 3 | 5) => void;
  polygonPath: PolygonPath[];
  onClearPolygon: () => void;
  circles: Circle[];
  onClearCircles: () => void;
  hideUI: boolean;
}

export function MapDrawingControls({
  isDrawing,
  onIsDrawingChange,
  isDrawingCircle,
  onIsDrawingCircleChange,
  circleRadius,
  onCircleRadiusChange,
  polygonPath,
  onClearPolygon,
  circles,
  onClearCircles,
  hideUI,
  isGisOverlayActive = false,
}: MapDrawingControlsProps & { isGisOverlayActive?: boolean }) {
  if (hideUI) return null;

  return (
    <div className={`absolute left-1/2 z-10 flex -translate-x-1/2 flex-col gap-2 ${isGisOverlayActive ? "bottom-8" : "top-4"}`}>
      <div className="flex gap-2">
        <button
          onClick={() => {
            onIsDrawingChange(!isDrawing);
            onIsDrawingCircleChange(false);
          }}
          className={`rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-white ${
            isDrawing ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
          title="Draw a polygon shape"
        >
          {isDrawing ? "Finish Drawing" : "Draw Polygon"}
        </button>
        <div className="relative flex items-center gap-2">
          <button
            onClick={() => {
              onIsDrawingCircleChange(!isDrawingCircle);
              onIsDrawingChange(false);
            }}
            className={`rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-white ${
              isDrawingCircle
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                : "hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            title="Draw a circle"
          >
            Draw Circle
          </button>
          {isDrawingCircle && (
            <select
              value={circleRadius}
              onChange={(e) =>
                onCircleRadiusChange(Number(e.target.value) as 1 | 2 | 3 | 5)
              }
              className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm shadow-lg transition-colors hover:bg-gray-50 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
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
          onClick={onClearPolygon}
          className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors hover:border-red-500 hover:bg-red-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-red-900/30"
        >
          Clear Polygon
        </button>
      )}
      {circles.length > 0 && (
        <button
          onClick={onClearCircles}
          className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors hover:border-red-500 hover:bg-red-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-red-900/30"
        >
          Clear Circles
        </button>
      )}
    </div>
  );
}
