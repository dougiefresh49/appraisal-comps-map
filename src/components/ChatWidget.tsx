"use client";

import { useState } from "react";
import { ChatPanel, ChatPanelToggle } from "~/components/ChatPanel";

interface ChatWidgetProps {
  projectId: string;
}

/**
 * Thin client wrapper mounted once per project workspace.
 * Manages open/close state for the chat panel + FAB toggle.
 */
export function ChatWidget({ projectId }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating toggle — fixed bottom-right, above main content */}
      <div className="fixed bottom-5 right-5 z-40 md:bottom-6 md:right-6">
        <ChatPanelToggle onClick={() => setIsOpen(true)} />
      </div>

      <ChatPanel
        projectId={projectId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
