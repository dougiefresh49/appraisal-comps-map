import { Suspense } from "react";
import { fetchInputsJson } from "~/server/photos/actions";
import { PhotoGridSkeleton } from "~/components/PhotoGridSkeleton";
import { PhotoGrid } from "~/components/PhotoGridWrapper";

interface PhotosPageProps {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{ folderId?: string; projectFolderId?: string }>;
}

export default async function ProjectPhotosPage({ searchParams, params }: PhotosPageProps) {
  const { folderId, projectFolderId } = await searchParams;
  const { projectId } = await params;
  console.log("Subject Photos Page projectId:", projectId); // Use it to suppress warning or remove if truly unnecessary

  if (!folderId || !projectFolderId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-700">
            Missing <code>folderId</code> query parameter. Please provide a
            Google Drive folder ID.
          </p>
        </div>
      </div>
    );
  }

  // We are not using projectId here yet, but we have it if we need to 
  // do server-side project lookup later if we move storage to DB.
  
  const { photos, fileId } = await fetchInputsJson(projectFolderId);

  return (
    <Suspense fallback={<PhotoGridSkeleton />}>
      <PhotoGrid
        initialPhotos={photos}
        fileId={fileId}
        folderId={folderId}
        projectFolderId={projectFolderId}
      />
    </Suspense>
  );
}
