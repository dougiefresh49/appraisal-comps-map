import { ReportSectionPage } from "~/components/ReportSectionPage";

export default async function ZoningReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <ReportSectionPage
      projectName={decodeURIComponent(projectId)}
      section="zoning"
      title="Zoning"
      description="Generate, view, and edit the zoning section."
    />
  );
}
