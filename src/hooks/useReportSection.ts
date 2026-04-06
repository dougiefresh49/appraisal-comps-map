"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchReportSection,
  upsertReportSection,
  subscribeToReportSections,
  type ReportSection,
  type RealtimeReportSectionPayload,
} from "~/lib/supabase-queries";

export interface UseReportSectionReturn {
  section: ReportSection | null;
  content: string;
  exists: boolean;
  isLoading: boolean;
  updateContent: (content: string) => Promise<void>;
  refreshSection: () => Promise<void>;
}

export function useReportSection(
  projectId: string,
  sectionKey: string,
): UseReportSectionReturn {
  const [section, setSection] = useState<ReportSection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  const loadSection = useCallback(async () => {
    if (!projectId || !sectionKey) return;
    try {
      const result = await fetchReportSection(projectId, sectionKey);
      if (!isMountedRef.current) return;
      setSection(result);
    } catch (err) {
      console.error("Failed to load report section", err);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [projectId, sectionKey]);

  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);
    void loadSection();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadSection]);

  useEffect(() => {
    if (!projectId) return;

    const channel = subscribeToReportSections(
      projectId,
      (payload: RealtimeReportSectionPayload) => {
        if (!isMountedRef.current) return;

        if (
          (payload.eventType === "INSERT" || payload.eventType === "UPDATE") &&
          payload.new &&
          payload.new.sectionKey === sectionKey
        ) {
          setSection(payload.new);
        }

        if (payload.eventType === "DELETE" && payload.old) {
          setSection((prev) =>
            prev?.id === payload.old?.id ? null : prev,
          );
        }
      },
    );

    return () => {
      void channel.unsubscribe();
    };
  }, [projectId, sectionKey]);

  const updateContent = useCallback(
    async (content: string) => {
      if (!projectId || !sectionKey) return;

      setSection((prev) => {
        const now = new Date().toISOString();
        if (prev) return { ...prev, content, updatedAt: now };
        return {
          id: "",
          projectId,
          sectionKey,
          content,
          version: 1,
          generationContext: {},
          propertyType: null,
          city: null,
          county: null,
          subjectAddress: null,
          createdAt: now,
          updatedAt: now,
        };
      });

      try {
        const updated = await upsertReportSection(
          projectId,
          sectionKey,
          content,
        );
        if (isMountedRef.current) {
          setSection(updated);
        }
      } catch (err) {
        console.error("Failed to update report section", err);
        if (isMountedRef.current) void loadSection();
      }
    },
    [projectId, sectionKey, loadSection],
  );

  return {
    section,
    content: section?.content ?? "",
    exists: section !== null && section.content.trim().length > 0,
    isLoading,
    updateContent,
    refreshSection: loadSection,
  };
}
