import { redirect } from "next/navigation";

interface ReportsIndexProps {
  searchParams?: { project?: string };
}

export default function ReportsIndex({ searchParams }: ReportsIndexProps) {
  const project = searchParams?.project;
  const query = project ? `?project=${encodeURIComponent(project)}` : "";
  redirect(`/reports/neighborhood${query}`);
}
