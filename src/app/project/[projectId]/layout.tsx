import React from "react";
import { ProjectWorkspaceProvider } from "~/hooks/useProject";
import { ProjectSidebar } from "~/components/ProjectSidebar";
import { ChatProvider } from "~/components/ChatWidget";
import { DocumentPanelProvider } from "~/components/DocumentPanelContext";
import { DocumentPanelSlot } from "~/components/DocumentPanelSlot";
import { ChatPanelSlot } from "~/components/ChatPanelSlot";
import { ChatToggleFAB } from "~/components/ChatToggleFAB";
import { TaskManagerProvider } from "~/components/TaskManagerContext";
import { TaskManagerWidget } from "~/components/TaskManagerWidget";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { projectId } = await params;

  return (
    <ProjectWorkspaceProvider projectId={projectId}>
      <TaskManagerProvider>
        <ChatProvider>
          <DocumentPanelProvider>
            <div className="flex h-svh min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-950 dark:text-gray-100">
              <ProjectSidebar projectId={projectId} />
              <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-14 md:pt-0">
                {children}
              </main>
              <DocumentPanelSlot projectId={projectId} />
              <ChatPanelSlot projectId={projectId} />
              <ChatToggleFAB />
              <TaskManagerWidget />
            </div>
          </DocumentPanelProvider>
        </ChatProvider>
      </TaskManagerProvider>
    </ProjectWorkspaceProvider>
  );
}
