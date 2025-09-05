"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { PhotoCard } from "./PhotoCard";
import type { PhotoInput } from "~/server/photos/actions";

interface PhotoGridProps {
  initialPhotos: PhotoInput[];
  fileId: string;
}

export default function PhotoGrid({ initialPhotos, fileId }: PhotoGridProps) {
  const [photos, setPhotos] = useState<PhotoInput[]>(initialPhotos);
  const [isSaving, setIsSaving] = useState(false);
  const [isDenseGrid, setIsDenseGrid] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    data?: string;
    error?: string;
  } | null>(null);

  const numPages = 1 + Math.ceil((photos.length - 3) / 6); // 3 is the number of photos in the first page
  const firstPagePhotos = photos.slice(0, 3);
  const otherPhotos = photos.slice(3);
  const otherPagePhotos = Array.from({ length: numPages - 1 }, (_, pageIndex) =>
    otherPhotos.slice(pageIndex * 6, (pageIndex + 2) * 6),
  );
  const pagePhotos = [firstPagePhotos, ...otherPagePhotos];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPhotos((items) => {
        const oldIndex = items.findIndex((item) => item.image === active.id);
        const newIndex = items.findIndex((item) => item.image === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleLabelChange = (imageName: string, newLabel: string) => {
    setPhotos((prevPhotos) =>
      prevPhotos.map((photo) =>
        photo.image === imageName ? { ...photo, label: newLabel } : photo,
      ),
    );
  };

  const handleDelete = (imageName: string) => {
    setPhotos((prevPhotos) =>
      prevPhotos.filter((photo) => photo.image !== imageName),
    );
  };

  const handleDiscardChanges = () => {
    setPhotos(initialPhotos);
    setSaveResult(null);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveResult(null);

      const updatedPhotos = photos.map(({ image, label }) => ({
        image,
        label,
      }));
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          photos: updatedPhotos,
          fileId: fileId,
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        data?: string;
        error?: string;
      };
      setSaveResult(result);
    } catch (error) {
      setSaveResult({
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("JSON data copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  if (photos.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-gray-400">
          <svg
            className="mx-auto h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-medium text-gray-900">
          No photos found
        </h3>
        <p className="text-gray-600">
          Try refreshing the page or check your Google Drive folder.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Action Buttons */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
          <button
            onClick={handleDiscardChanges}
            disabled={isSaving}
            className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard Changes
          </button>
          <button
            onClick={() => setIsDenseGrid(!isDenseGrid)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {isDenseGrid ? "Document View" : "Dense Grid"}
          </button>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="rounded-lg px-4 py-2 font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          Refresh
        </button>
      </div>

      {/* Save Result */}
      {saveResult && (
        <div
          className={`mb-6 rounded-lg p-4 ${
            saveResult.success
              ? "border border-green-200 bg-green-50"
              : "border border-red-200 bg-red-50"
          }`}
        >
          {saveResult.success ? (
            <div>
              <p className="mb-2 font-medium text-green-800">
                Changes saved successfully!
              </p>
              {saveResult.data && (
                <div>
                  <p className="mb-2 text-sm text-green-700">
                    {saveResult.error}
                  </p>
                  <button
                    onClick={() => copyToClipboard(saveResult.data!)}
                    className="rounded bg-green-600 px-3 py-1 text-sm text-white transition-colors hover:bg-green-700"
                  >
                    Copy JSON to Clipboard
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-red-800">{saveResult.error}</p>
          )}
        </div>
      )}

      {/* Photo Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={photos.map((photo) => photo.image)}
          strategy={rectSortingStrategy}
        >
          {isDenseGrid ? (
            // Dense Grid Layout - 4 columns, no page dividers
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {photos.map((photo) => (
                <PhotoCard
                  key={photo.image}
                  photo={photo}
                  onLabelChange={(newLabel: string) =>
                    handleLabelChange(photo.image, newLabel)
                  }
                  onDelete={handleDelete}
                  isDense={true}
                />
              ))}
            </div>
          ) : (
            // Document Layout - 2x3 grid with page dividers
            <div className="space-y-6">
              {/* Render photos in 2x3 grid format */}
              {Array.from({ length: numPages }, (_, pageIndex) => (
                <div key={pageIndex}>
                  <div
                    className={`grid gap-6 ${
                      pageIndex === 0
                        ? "mx-auto max-w-lg grid-cols-1 justify-center"
                        : "grid-cols-2"
                    }`}
                  >
                    {pagePhotos[pageIndex]?.map((photo, photoIndex) => (
                      <PhotoCard
                        key={photo.image}
                        photo={photo}
                        onLabelChange={(newLabel: string) =>
                          handleLabelChange(photo.image, newLabel)
                        }
                        onDelete={handleDelete}
                        isDense={false}
                      />
                    ))}
                  </div>
                  {/* Add page divider after each page except the last */}
                  {pageIndex < numPages - 1 && (
                    <div className="mt-6 border-t-2 border-gray-300 pt-6">
                      <div className="text-center">
                        <span className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-500">
                          Page {pageIndex + 2}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SortableContext>
      </DndContext>
    </>
  );
}
