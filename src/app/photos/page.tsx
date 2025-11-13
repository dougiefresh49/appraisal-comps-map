import { Suspense } from "react";
import { fetchInputsJson } from "~/server/photos/actions";
import { PhotoGridSkeleton } from "~/components/PhotoGridSkeleton";
import { PhotoGrid } from "~/components/PhotoGridWrapper";

interface PhotosPageProps {
  searchParams: Promise<{ folderId?: string }>;
}

export default async function PhotosPage({ searchParams }: PhotosPageProps) {
  const params = await searchParams;
  const folderId = params.folderId;

  if (!folderId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-700">
            Missing <code>folderId</code> query parameter. Please provide a Google Drive folder ID.
          </p>
        </div>
      </div>
    );
  }

  const { photos, fileId } = await fetchInputsJson(folderId);

  return (
    <Suspense fallback={<PhotoGridSkeleton />}>
      <PhotoGrid initialPhotos={photos} fileId={fileId} folderId={folderId} />
    </Suspense>
  );
}
