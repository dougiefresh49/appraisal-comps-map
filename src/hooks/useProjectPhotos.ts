"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchProjectPhotos,
  fetchArchivedPhotos,
  updatePhotoLabel as updateLabelDb,
  updatePhotoCategory as updatePhotoCategoryDb,
  updatePhotoSortOrder,
  archivePhoto as archivePhotoDb,
  restorePhoto as restorePhotoDb,
  subscribeToProjectPhotos,
  type PhotoAnalysis,
  type RealtimePhotoPayload,
} from "~/lib/supabase-queries";

interface UseProjectPhotosReturn {
  photos: PhotoAnalysis[];
  archivedPhotos: PhotoAnalysis[];
  isLoading: boolean;
  showArchived: boolean;
  setShowArchived: (show: boolean) => void;
  updateLabel: (photoId: string, label: string) => void;
  updateCategory: (photoId: string, category: string) => void;
  reorder: (activeId: string, overId: string) => void;
  archivePhoto: (photoId: string) => void;
  restorePhoto: (photoId: string) => void;
  refreshPhotos: () => Promise<void>;
}

export function useProjectPhotos(projectId: string): UseProjectPhotosReturn {
  const [photos, setPhotos] = useState<PhotoAnalysis[]>([]);
  const [archivedPhotos, setArchivedPhotos] = useState<PhotoAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const isMountedRef = useRef(true);

  const loadPhotos = useCallback(async () => {
    try {
      const [included, archived] = await Promise.all([
        fetchProjectPhotos(projectId),
        fetchArchivedPhotos(projectId),
      ]);
      if (!isMountedRef.current) return;
      setPhotos(included);
      setArchivedPhotos(archived);
    } catch (err) {
      console.error("Failed to load photos", err);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadPhotos();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadPhotos]);

  useEffect(() => {
    if (!projectId) return;

    const channel = subscribeToProjectPhotos(
      projectId,
      (payload: RealtimePhotoPayload) => {
        if (!isMountedRef.current) return;

        if (payload.eventType === "INSERT" && payload.new) {
          const photo = payload.new;
          if (photo.isIncluded) {
            setPhotos((prev) => {
              if (prev.some((p) => p.id === photo.id)) return prev;
              return [...prev, photo].sort(
                (a, b) => a.sortOrder - b.sortOrder,
              );
            });
          } else {
            setArchivedPhotos((prev) => {
              if (prev.some((p) => p.id === photo.id)) return prev;
              return [...prev, photo];
            });
          }
        }

        if (payload.eventType === "UPDATE" && payload.new) {
          const updated = payload.new;
          if (updated.isIncluded) {
            setPhotos((prev) =>
              prev
                .filter((p) => p.id !== updated.id)
                .concat(updated)
                .sort((a, b) => a.sortOrder - b.sortOrder),
            );
            setArchivedPhotos((prev) =>
              prev.filter((p) => p.id !== updated.id),
            );
          } else {
            setArchivedPhotos((prev) =>
              prev.filter((p) => p.id !== updated.id).concat(updated),
            );
            setPhotos((prev) => prev.filter((p) => p.id !== updated.id));
          }
        }

        if (payload.eventType === "DELETE" && payload.old) {
          const deletedId = payload.old.id;
          setPhotos((prev) => prev.filter((p) => p.id !== deletedId));
          setArchivedPhotos((prev) =>
            prev.filter((p) => p.id !== deletedId),
          );
        }
      },
    );

    return () => {
      void channel.unsubscribe();
    };
  }, [projectId]);

  const updateLabel = useCallback(
    (photoId: string, label: string) => {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, label } : p)),
      );
      setArchivedPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, label } : p)),
      );
      void updateLabelDb(photoId, label);
    },
    [],
  );

  const updateCategory = useCallback(
    (photoId: string, category: string) => {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, category } : p)),
      );
      setArchivedPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, category } : p)),
      );
      void updatePhotoCategoryDb(photoId, category);
    },
    [],
  );

  const reorder = useCallback(
    (activeId: string, overId: string) => {
      setPhotos((prev) => {
        const oldIndex = prev.findIndex((p) => p.id === activeId);
        const newIndex = prev.findIndex((p) => p.id === overId);
        if (oldIndex === -1 || newIndex === -1) return prev;

        const reordered = [...prev];
        const [moved] = reordered.splice(oldIndex, 1);
        if (!moved) return prev;
        reordered.splice(newIndex, 0, moved);

        const withNewOrder = reordered.map((p, i) => ({
          ...p,
          sortOrder: i,
        }));

        void updatePhotoSortOrder(
          withNewOrder.map((p) => ({ id: p.id, sortOrder: p.sortOrder })),
        );

        return withNewOrder;
      });
    },
    [],
  );

  const archivePhoto = useCallback(
    (photoId: string) => {
      setPhotos((prev) => {
        const photo = prev.find((p) => p.id === photoId);
        if (photo) {
          setArchivedPhotos((archived) => [
            ...archived,
            { ...photo, isIncluded: false },
          ]);
        }
        return prev.filter((p) => p.id !== photoId);
      });
      void archivePhotoDb(photoId);
    },
    [],
  );

  const restorePhoto = useCallback(
    (photoId: string) => {
      setArchivedPhotos((prev) => {
        const photo = prev.find((p) => p.id === photoId);
        if (photo) {
          setPhotos((included) =>
            [...included, { ...photo, isIncluded: true }].sort(
              (a, b) => a.sortOrder - b.sortOrder,
            ),
          );
        }
        return prev.filter((p) => p.id !== photoId);
      });
      void restorePhotoDb(photoId);
    },
    [],
  );

  return {
    photos,
    archivedPhotos,
    isLoading,
    showArchived,
    setShowArchived,
    updateLabel,
    updateCategory,
    reorder,
    archivePhoto,
    restorePhoto,
    refreshPhotos: loadPhotos,
  };
}
