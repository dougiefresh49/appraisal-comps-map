"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { useState, useRef, useEffect } from "react";

interface StreetLabelProps {
  position: { lat: number; lng: number };
  text: string;
  rotation?: number; // in degrees
  onPositionChange: (position: { lat: number; lng: number }) => void;
  onRotationChange: (rotation: number) => void;
  onTextChange: (text: string) => void;
  isEditing?: boolean;
  onEditToggle?: () => void;
  hideUI?: boolean;
  sizeMultiplier?: number; // Size multiplier for the label
}

export function StreetLabel({
  position,
  text,
  rotation = 0,
  onPositionChange,
  onRotationChange,
  onTextChange,
  isEditing = false,
  onEditToggle,
  hideUI = false,
  sizeMultiplier = 1.0,
}: StreetLabelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);
  const rotationHandleRef = useRef<HTMLDivElement>(null);
  const startRotationRef = useRef<number>(rotation);
  const startAngleRef = useRef<number>(0);

  // Handle drag end
  const handleDragEnd = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      onPositionChange({
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
      });
    }
    setIsDragging(false);
  };

  // Handle rotation via mouse
  useEffect(() => {
    if (!isRotating || !labelRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!labelRef.current) return;

      const rect = labelRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const angle =
        Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

      const deltaAngle = angle - startAngleRef.current;
      const newRotation = startRotationRef.current + deltaAngle;
      onRotationChange(newRotation);
    };

    const handleMouseUp = () => {
      setIsRotating(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isRotating, onRotationChange]);

  const handleRotationStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!labelRef.current) return;

    const rect = labelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    startAngleRef.current =
      Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    startRotationRef.current = rotation;
    setIsRotating(true);
  };

  return (
    <AdvancedMarker
      position={position}
      draggable={!isRotating}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={labelRef}
        className="relative inline-block cursor-move select-none"
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "center center",
          padding: `${20 * sizeMultiplier}px`, // Add padding to create a larger draggable area
        }}
      >
        {/* Text Content - White with black stroke */}
        <div
          className="whitespace-nowrap"
          style={{
            fontSize: `${36 * sizeMultiplier}px`,
            fontWeight: 700,
            color: "white",
            textShadow:
              "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
            pointerEvents: isEditing ? "auto" : "none",
          }}
        >
          {isEditing ? (
            <input
              type="text"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              onBlur={() => onEditToggle?.()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onEditToggle?.();
                }
              }}
              className="bg-transparent text-center outline-none"
              style={{
                fontSize: `${36 * sizeMultiplier}px`,
                fontWeight: 700,
                color: "white",
                textShadow:
                  "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
              }}
              autoFocus
            />
          ) : (
            <span>{text}</span>
          )}
        </div>

        {/* Rotation Handle */}
        {!hideUI && (
          <div
            ref={rotationHandleRef}
            className="absolute top-1/2 right-0 z-10 h-6 w-6 translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-blue-500 bg-white shadow-lg active:cursor-grabbing"
            onMouseDown={(e) => {
              e.stopPropagation();
              handleRotationStart(e);
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ pointerEvents: "auto" }}
            title="Rotate label"
          />
        )}
      </div>
    </AdvancedMarker>
  );
}
