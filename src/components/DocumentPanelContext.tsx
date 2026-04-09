"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type DocumentPanelOpenPayload = {
  projectId: string;
  sectionKey: string;
  compFolderId?: string;
  sectionTag?: string;
  onExcludedIdsChange?: (excludedIds: Set<string>) => void;
  showPhotoContext?: boolean;
  onPhotoContextChange?: (includePhotos: boolean) => void;
};

interface DocumentPanelState {
  isOpen: boolean;
  payload: DocumentPanelOpenPayload | null;
  open: (p: DocumentPanelOpenPayload) => void;
  close: () => void;
}

const DocumentPanelContext = createContext<DocumentPanelState | null>(null);

export function useDocumentPanel(): DocumentPanelState {
  const ctx = useContext(DocumentPanelContext);
  if (!ctx) {
    throw new Error("useDocumentPanel must be used within DocumentPanelProvider");
  }
  return ctx;
}

export function DocumentPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [payload, setPayload] = useState<DocumentPanelOpenPayload | null>(
    null,
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setPayload(null);
  }, []);

  const open = useCallback((p: DocumentPanelOpenPayload) => {
    setPayload(p);
    setIsOpen(true);
  }, []);

  return (
    <DocumentPanelContext.Provider
      value={{ isOpen, payload, open, close }}
    >
      {children}
    </DocumentPanelContext.Provider>
  );
}
