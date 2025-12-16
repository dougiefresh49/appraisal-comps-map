import { ReportSectionPage } from "~/components/ReportSectionPage";

export default async function HighestBestUseReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <ReportSectionPage
      projectName={decodeURIComponent(projectId)}
      section="highest-best-use"
      title="Highest and Best Use"
      description="Generate, view, and edit the highest and best use section."
    />
  );
}
