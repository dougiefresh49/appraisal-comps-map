import { Suspense, use } from "react";
import { PhotoGridSkeleton } from "~/components/PhotoGridSkeleton";
import { PhotoGrid } from "~/components/PhotoGridWrapper";

interface PhotosPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function ProjectPhotosPage({ params }: PhotosPageProps) {
  const { projectId } = use(params);

  return (
    <Suspense fallback={<PhotoGridSkeleton />}>
      <PhotoGrid projectId={projectId} />
    </Suspense>
  );
}
