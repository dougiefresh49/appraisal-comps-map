"use client";

import { ChatPanelToggle } from "~/components/ChatPanel";
import { useChatPanel } from "~/components/ChatWidget";

export function ChatToggleFAB() {
  const { isOpen, open } = useChatPanel();
  if (isOpen) return null;
  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden md:bottom-6 md:right-6">
      <ChatPanelToggle onClick={open} />
    </div>
  );
}
