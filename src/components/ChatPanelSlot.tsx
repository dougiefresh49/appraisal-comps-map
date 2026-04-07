"use client";

import { ChatPanel } from "~/components/ChatPanel";
import { useChatPanel } from "~/components/ChatWidget";

export function ChatPanelSlot({ projectId }: { projectId: string }) {
  const { isOpen, close } = useChatPanel();
  return <ChatPanel projectId={projectId} isOpen={isOpen} onClose={close} />;
}
