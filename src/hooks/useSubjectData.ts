"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "~/utils/supabase/client";
import type { SubjectDataRow, FemaData } from "~/types/comp-data";

export interface UseSubjectDataReturn {
  subjectData: SubjectDataRow | null;
  isLoading: boolean;
  error: string | null;
  saveSubjectData: (updates: Partial<Omit<SubjectDataRow, "id" | "project_id" | "updated_at">>) => Promise<void>;
  /** Accept merged rebuild result: updates core + fema, clears proposed columns. */
  clearProposedData: (
    mergedCore: Record<string, unknown>,
    mergedFema: FemaData,
  ) => Promise<void>;
  refreshSubjectData: () => Promise<void>;
}

export function useSubjectData(projectId: string): UseSubjectDataReturn {
  const [subjectData, setSubjectData] = useState<SubjectDataRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const loadSubjectData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const result = await supabase
        .from("subject_data")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();

      if (result.error) throw result.error;

      if (isMountedRef.current) {
        setSubjectData(result.data as SubjectDataRow | null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load subject data");
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadSubjectData();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadSubjectData]);

  // Realtime subscription
  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`subject_data:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subject_data",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (!isMountedRef.current) return;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setSubjectData(payload.new as SubjectDataRow);
          } else if (payload.eventType === "DELETE") {
            setSubjectData(null);
          }
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [projectId]);

  const saveSubjectData = useCallback(
    async (
      updates: Partial<Omit<SubjectDataRow, "id" | "project_id" | "updated_at">>,
    ) => {
      if (!projectId) return;

      const supabase = createClient();
      const payload = {
        project_id: projectId,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const upsertResult = await supabase
        .from("subject_data")
        .upsert(payload, { onConflict: "project_id" })
        .select()
        .single();

      if (upsertResult.error) {
        throw new Error(upsertResult.error.message);
      }

      if (isMountedRef.current) {
        setSubjectData(upsertResult.data as SubjectDataRow);
      }
    },
    [projectId],
  );

  const clearProposedData = useCallback(
    async (
      mergedCore: Record<string, unknown>,
      mergedFema: FemaData,
    ) => {
      if (!projectId) return;

      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from("subject_data")
        .update({
          core: mergedCore,
          fema: mergedFema,
          proposed_core: null,
          proposed_fema: null,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", projectId);

      if (updateErr) {
        throw new Error(updateErr.message);
      }

      await loadSubjectData();
    },
    [projectId, loadSubjectData],
  );

  return {
    subjectData,
    isLoading,
    error,
    saveSubjectData,
    clearProposedData,
    refreshSubjectData: loadSubjectData,
  };
}
