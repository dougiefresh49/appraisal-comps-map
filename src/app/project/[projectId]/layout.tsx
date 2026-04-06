import React from "react";
import { ProjectWorkspaceProvider } from "~/hooks/useProject";
import { ProjectSidebar } from "~/components/ProjectSidebar";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { projectId } = await params;

  return (
    <ProjectWorkspaceProvider projectId={projectId}>
      <div className="flex h-svh min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-950 dark:text-gray-100">
        <ProjectSidebar projectId={projectId} />
        <main className="min-h-0 flex-1 overflow-y-auto pt-14 md:pt-0">
          {children}
        </main>
      </div>
    </ProjectWorkspaceProvider>
  );
}
