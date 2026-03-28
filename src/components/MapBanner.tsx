"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PencilSquareIcon, MapIcon } from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";

interface MapBannerProps {
  projectId: string;
  imageType: string;
  editHref: string;
  height?: string;
  fallbackLabel?: string;
}

interface FolderStructure {
  reportMapsFolderId?: string;
  [key: string]: unknown;
}

/**
 * Displays a map image banner loaded from the project's Google Drive
 * reports/maps/ folder. Shows a placeholder when the image is unavailable.
 */
export function MapBanner({
  projectId,
  imageType,
  editHref,
  height = "h-56",
  fallbackLabel,
}: MapBannerProps) {
  const { project } = useProject(projectId);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      setIsLoading(true);

      const raw = project as unknown as Record<string, unknown> | undefined;
      const folderStructure = (raw?.folderStructure ??
        raw?.folder_structure) as FolderStructure | undefined;

      const mapsFolderId = folderStructure?.reportMapsFolderId;
      if (!mapsFolderId) {
        setIsLoading(false);
        return;
      }

      try {
        const fileName = `${imageType}.png`;
        const res = await fetch("/api/drive/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: mapsFolderId, filesOnly: true }),
        });

        if (!res.ok) {
          setIsLoading(false);
          return;
        }

        const data = (await res.json()) as {
          files: { id: string; name: string; mimeType: string }[];
        };

        const match = data.files.find(
          (f) => f.name.toLowerCase() === fileName.toLowerCase(),
        );

        if (match && !cancelled) {
          setImageUrl(
            `https://drive.google.com/thumbnail?id=${match.id}&sz=w1200`,
          );
        }
      } catch {
        // Silently fail -- show placeholder
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadImage();
    return () => {
      cancelled = true;
    };
  }, [project, imageType]);

  const label = fallbackLabel ?? `${imageType.charAt(0).toUpperCase()}${imageType.slice(1)} Map`;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-gray-800 bg-gray-900 ${height}`}
    >
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
        </div>
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={label}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <MapIcon className="h-10 w-10 text-gray-700" />
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-xs text-gray-600">
            Edit the map to update this preview
          </p>
        </div>
      )}

      <Link
        href={editHref}
        className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-gray-900/80 px-3 py-1.5 text-xs font-semibold text-gray-200 shadow-lg ring-1 ring-gray-700 backdrop-blur-sm transition hover:bg-gray-800 hover:ring-gray-600"
      >
        <PencilSquareIcon className="h-3.5 w-3.5" />
        Edit Map
      </Link>
    </div>
  );
}
