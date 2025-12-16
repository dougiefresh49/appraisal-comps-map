"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { type PhotoInput } from "~/server/photos/actions";
import { LazyImage } from "./LazyImage";

interface PhotoCardProps {
  photo: PhotoInput;
  onLabelChange: (newLabel: string) => void;
  onDelete: (imageName: string) => void;
  isDense?: boolean;
  index?: number; // For staggered loading delays
}

export function PhotoCard({
  photo,
  onLabelChange,
  onDelete,
  isDense = false,
  index = 0,
}: PhotoCardProps) {
  // Stagger loading delays: 100ms per image to prevent rate limiting
  const loadDelay = index * 100;
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
    <div ref={setNodeRef} style={style} className="group relative">
      <div
        className={`overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md transition-shadow hover:shadow-lg ${isDense ? "text-xs" : ""}`}
      >
        {/* Image - Drag Area */}
        <div
          className={`relative aspect-[3/2] cursor-grab bg-gray-100 active:cursor-grabbing ${isDense ? "h-24" : ""}`}
          {...attributes}
          {...listeners}
        >
          <LazyImage
            src={photo.webViewUrl}
            alt={photo.label}
            className="h-full w-full object-cover"
            delay={loadDelay}
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

        {/* Label - Action Area */}
        <div className={isDense ? "p-2" : "p-3"}>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={handleKeyPress}
                onBlur={handleLabelSave}
                className={`flex-1 rounded border border-gray-300 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                  isDense ? "px-1 py-1 text-xs" : "px-2 py-1 text-sm"
                }`}
                autoFocus
              />
              <button
                onClick={handleLabelSave}
                className={`text-blue-600 hover:text-blue-800 ${
                  isDense ? "text-xs" : "text-xs"
                }`}
              >
                Save
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span
                className={`cursor-pointer truncate font-medium text-gray-900 hover:text-blue-600 ${
                  isDense ? "text-xs" : "text-sm"
                }`}
                onClick={() => setIsEditing(true)}
                title="Click to edit"
              >
                {photo.label}
              </span>
              <div className="flex items-center gap-1">
                <a
                  href={photo.webViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700"
                  title="View full size"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                </a>
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded p-1 text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700"
                  title="Edit label"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(photo.image)}
                  className="rounded p-1 text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600"
                  title="Delete photo"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
