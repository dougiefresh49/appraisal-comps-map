"use client";

import { use, useCallback, useEffect, useState } from "react";
import { XMarkIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";

interface FolderStructure {
  subjectSketchesFolderId?: string;
  [key: string]: unknown;
}

interface DriveListFile {
  id: string;
  name: string;
  mimeType: string;
}

interface SubjectSketchesPageProps {
  params: Promise<{ projectId: string }>;
}

function isImageFile(f: DriveListFile): boolean {
  return f.mimeType.startsWith("image/");
}

export default function SubjectSketchesPage({ params }: SubjectSketchesPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);

  const { project, isLoading: projectLoading } = useProject(decodedProjectId);

  const [files, setFiles] = useState<DriveListFile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string>("");

  const raw = project as unknown as Record<string, unknown> | undefined;
  const folderStructure = (raw?.folderStructure ??
    raw?.folder_structure) as FolderStructure | undefined;
  const sketchesFolderId = folderStructure?.subjectSketchesFolderId;

  const loadFiles = useCallback(async () => {
    if (!sketchesFolderId) {
      setFiles([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: sketchesFolderId,
          filesOnly: true,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { files: DriveListFile[] };
      setFiles(data.files ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load sketches");
      setFiles([]);
    } finally {
      setListLoading(false);
    }
  }, [sketchesFolderId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const images = files.filter(isImageFile);

  const openLightbox = (file: DriveListFile) => {
    setLightboxId(file.id);
    setLightboxName(file.name);
  };

  return (
    <div className="min-h-full bg-gray-950 p-6 text-gray-100 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Subject sketches</h1>
          <p className="mt-1 text-sm text-gray-400">
            Images from the subject/sketches folder in Drive.
          </p>
        </div>

        {projectLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
          </div>
        ) : !sketchesFolderId ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-16 text-center">
            <PhotoIcon className="mx-auto h-12 w-12 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">
              No sketches folder is linked for this project. Complete project setup
              or link a Drive folder that includes{" "}
              <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-300">
                subject/sketches
              </code>
              .
            </p>
          </div>
        ) : listLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
          </div>
        ) : listError ? (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {listError}
          </div>
        ) : images.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-16 text-center">
            <PhotoIcon className="mx-auto h-12 w-12 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">No images in this folder.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {images.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => openLightbox(file)}
                className="group relative aspect-square overflow-hidden rounded-lg border border-gray-800 bg-gray-900 text-left transition hover:border-gray-600 hover:ring-2 hover:ring-blue-600/40 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://drive.google.com/thumbnail?id=${file.id}&sz=w600`}
                  alt={file.name}
                  className="h-full w-full object-cover transition group-hover:opacity-90"
                  loading="lazy"
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gray-950/85 px-2 py-1 text-[10px] text-gray-400">
                  {file.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {lightboxId && (
        <button
          type="button"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setLightboxId(null)}
          aria-label="Close preview"
        >
          <span
            className="relative max-h-[90vh] max-w-[min(96vw,1200px)] overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between gap-4 border-b border-gray-800 px-4 py-2">
              <span className="min-w-0 truncate text-sm font-medium text-gray-200">
                {lightboxName}
              </span>
              <button
                type="button"
                onClick={() => setLightboxId(null)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-gray-100"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-3rem)] overflow-auto p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://drive.google.com/thumbnail?id=${lightboxId}&sz=w1600`}
                alt={lightboxName}
                className="mx-auto max-h-[calc(90vh-5rem)] w-auto max-w-full object-contain"
              />
            </div>
          </span>
        </button>
      )}
    </div>
  );
}
