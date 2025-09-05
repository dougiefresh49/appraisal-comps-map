import { Suspense } from "react";
import { fetchInputsJson } from "~/server/photos/actions";
import { PhotoGridSkeleton } from "~/components/PhotoGridSkeleton";
import { PhotoGrid } from "~/components/PhotoGridWrapper";

export default async function PhotosPage() {
  const { photos, fileId } = await fetchInputsJson();

  return (
    <Suspense fallback={<PhotoGridSkeleton />}>
      <PhotoGrid initialPhotos={photos} fileId={fileId} />
    </Suspense>
  );
}
