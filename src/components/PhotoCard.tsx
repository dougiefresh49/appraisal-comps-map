"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { type PhotoInput } from "~/server/photos/actions";

interface PhotoCardProps {
  photo: PhotoInput;
  onLabelChange: (newLabel: string) => void;
}

export function PhotoCard({ photo, onLabelChange }: PhotoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(photo.label);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.image });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleLabelSave = () => {
    if (editLabel.trim() !== photo.label) {
      onLabelChange(editLabel.trim());
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLabelSave();
    } else if (e.key === "Escape") {
      setEditLabel(photo.label);
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md transition-shadow hover:shadow-lg">
        {/* Image */}
        <div className="relative aspect-[3/2] bg-gray-100">
          <img
            src={photo.webViewUrl}
            alt={photo.label}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {/* Drag handle overlay */}
          <div className="bg-opacity-0 group-hover:bg-opacity-10 absolute inset-0 flex items-center justify-center transition-all duration-200">
            <div className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <svg
                className="h-6 w-6 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M7 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 2zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 8zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 14zm6-8a2 2 0 1 1-.001-4.001A2 2 0 0 1 13 6zm0 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 8zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 14z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Label */}
        <div className="p-3">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={handleKeyPress}
                onBlur={handleLabelSave}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLabelSave();
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="group flex items-center justify-between">
              <span className="truncate text-sm font-medium text-gray-900">
                {photo.label}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="text-xs text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:text-gray-700"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
