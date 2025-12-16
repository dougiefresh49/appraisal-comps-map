import React from "react";
import { ProjectSidebar } from "~/components/ProjectSidebar";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { projectId } = await params;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ProjectSidebar projectId={projectId} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
