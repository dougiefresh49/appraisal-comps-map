import { ReportSectionPage } from "~/components/ReportSectionPage";

export default async function SubjectSiteSummaryReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <ReportSectionPage
      projectName={decodeURIComponent(projectId)}
      section="subject-site-summary"
      title="Subject Site Summary"
      description="Generate, view, and edit the subject site summary section."
    />
  );
}
