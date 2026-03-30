import React from "react";
import { ProjectSidebar } from "~/components/ProjectSidebar";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { projectId } = await params;

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 dark:text-gray-100">
      <ProjectSidebar projectId={projectId} />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  );
}
