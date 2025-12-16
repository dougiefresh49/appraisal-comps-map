import { ReportSectionPage } from "~/components/ReportSectionPage";

export default async function OwnershipReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <ReportSectionPage
      projectName={decodeURIComponent(projectId)}
      section="ownership"
      title="Ownership"
      description="Generate, view, and edit the ownership section."
    />
  );
}
