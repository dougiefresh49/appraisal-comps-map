"use client";

import { useState, useEffect } from "react";
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
import { PhotoCard } from "~/components/PhotoCard";
import type { PhotoInput } from "~/server/photos/actions";

export default function PhotosPage() {
  const [photos, setPhotos] = useState<Array<PhotoInput>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    data?: string;
    error?: string;
  } | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    void loadPhotos();
  }, []);

  const loadPhotos = async () => {
    try {
      console.log("🔄 Starting loadPhotos...");
      setIsLoading(true);
      const response = await fetch("/api/photos");
      console.log("📥 API response status:", response.status);

      const result = (await response.json()) as {
        success: boolean;
        data?: Array<PhotoInput>;
        error?: string;
        fileId?: string;
      };

      console.log("📦 API result:", result);
      console.log("📦 Success:", result.success);
      console.log("📦 Data count:", result.data?.length);
      console.log("📦 Sample data:", result.data?.slice(0, 2));

      if (result.success && result.data) {
        console.log(
          "✅ Setting photos state with",
          result.data.length,
          "photos",
        );
        setPhotos(result.data);
        setFileId(result.fileId || null);
      } else {
        console.error("❌ Error loading photos:", result.error);
      }
    } catch (error) {
      console.error("❌ Error in loadPhotos:", error);
    } finally {
      console.log("🏁 Finished loadPhotos");
      setIsLoading(false);
    }
  };

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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Loading photos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">
            Photo Management
          </h1>
          <p className="text-gray-600">
            Drag and drop photos to reorder, click &quot;Edit&quot; to change
            labels, then save your changes.
          </p>
        </div>

        {/* Save Button */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>

          <button
            onClick={loadPhotos}
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
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {photos.map((photo) => (
                <PhotoCard
                  key={photo.image}
                  photo={photo}
                  onLabelChange={(newLabel: string) =>
                    handleLabelChange(photo.image, newLabel)
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Empty State */}
        {photos.length === 0 && !isLoading && (
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
        )}
      </div>
    </div>
  );
}
