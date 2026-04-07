"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Context so the toggle (anywhere) and the panel (in layout) share state
// ---------------------------------------------------------------------------

interface ChatState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const ChatContext = createContext<ChatState | null>(null);

export function useChatPanel(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatPanel must be used within ChatProvider");
  return ctx;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ChatContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen((v) => !v),
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
