import { redirect } from "next/navigation";

export default async function ReportsIndex({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/project/${projectId}/reports/neighborhood`);
}
