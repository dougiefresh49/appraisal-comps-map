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
}: MapDrawingControlsProps) {
  if (hideUI) return null;

  return (
    <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => {
            onIsDrawingChange(!isDrawing);
            onIsDrawingCircleChange(false);
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
              onIsDrawingCircleChange(!isDrawingCircle);
              onIsDrawingChange(false);
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
                onCircleRadiusChange(Number(e.target.value) as 1 | 2 | 3 | 5)
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
          onClick={onClearPolygon}
          className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors hover:border-red-500 hover:bg-red-50"
        >
          Clear Polygon
        </button>
      )}
      {circles.length > 0 && (
        <button
          onClick={onClearCircles}
          className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 shadow-lg transition-colors hover:border-red-500 hover:bg-red-50"
        >
          Clear Circles
        </button>
      )}
    </div>
  );
}
