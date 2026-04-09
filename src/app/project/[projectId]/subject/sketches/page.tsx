"use client";

import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { ImageZoomLightbox } from "~/components/ImageZoomLightbox";
import { useProject } from "~/hooks/useProject";
import { driveFetch } from "~/lib/drive-fetch";

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

function SketchThumbnailCard({
  file,
  onOpen,
}: {
  file: DriveListFile;
  onOpen: () => void;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const thumbUrl = `/api/drive/thumbnail/${file.id}?sz=1024`;

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onOpen}
      className="group relative flex min-h-[min(52vw,420px)] w-full flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 text-left transition hover:border-gray-600 hover:ring-2 hover:ring-blue-600/40 focus:ring-2 focus:ring-blue-500 focus:outline-none sm:min-h-[320px]"
    >
      <div className="relative min-h-[200px] flex-1 bg-gray-950/80 sm:min-h-[260px]">
        {shouldLoad ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbUrl}
            alt={file.name}
            className="h-full max-h-[min(56vh,520px)] w-full object-contain object-center transition group-hover:opacity-95 sm:max-h-[480px]"
            loading="lazy"
          />
        ) : (
          <div
            className="h-full min-h-[200px] w-full animate-pulse bg-gray-800/90 sm:min-h-[260px]"
            aria-hidden
          />
        )}
      </div>
      <span className="truncate border-t border-gray-800/80 bg-gray-950/90 px-3 py-2 text-left text-xs text-gray-400">
        {file.name}
      </span>
    </button>
  );
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
      const res = await driveFetch("/api/drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: sketchesFolderId,
          filesOnly: true,
        }),
      });
      const data = (await res.json()) as {
        files?: DriveListFile[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
            {images.map((file) => (
              <SketchThumbnailCard
                key={file.id}
                file={file}
                onOpen={() => openLightbox(file)}
              />
            ))}
          </div>
        )}
      </div>

      {lightboxId ? (
        <ImageZoomLightbox
          imageSrc={`/api/drive/file/${lightboxId}`}
          title={lightboxName}
          onClose={() => setLightboxId(null)}
        />
      ) : null}
    </div>
  );
}
