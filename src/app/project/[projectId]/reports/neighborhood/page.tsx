import { ReportSectionPage } from "~/components/ReportSectionPage";

export default async function NeighborhoodReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <ReportSectionPage
      projectName={decodeURIComponent(projectId)}
      section="neighborhood"
      title="Neighborhood"
      description="Generate, view, and edit the neighborhood section."
    />
  );
}
