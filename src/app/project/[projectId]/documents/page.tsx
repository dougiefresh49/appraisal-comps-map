import { DocumentManager } from "~/components/DocumentManager";

interface DocumentsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function DocumentsPage({ params }: DocumentsPageProps) {
  const { projectId } = await params;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <DocumentManager projectId={projectId} />
    </div>
  );
}
