"use client";

import { DocumentContextPanel } from "~/components/DocumentContextPanel";
import { useDocumentPanel } from "~/components/DocumentPanelContext";

export function DocumentPanelSlot({ projectId }: { projectId: string }) {
  const { isOpen, payload, close } = useDocumentPanel();
  if (!isOpen || !payload || payload.projectId !== projectId) return null;

  return (
    <DocumentContextPanel
      projectId={payload.projectId}
      sectionKey={payload.sectionKey}
      isOpen={isOpen}
      onClose={close}
      compFolderId={payload.compFolderId}
      sectionTag={payload.sectionTag}
      onExcludedIdsChange={payload.onExcludedIdsChange}
      showPhotoContext={payload.showPhotoContext}
      onPhotoContextChange={payload.onPhotoContextChange}
    />
  );
}
