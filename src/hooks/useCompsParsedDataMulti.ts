"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "~/utils/supabase/client";

type RawDataMap = Map<string, Record<string, unknown>>;

export interface UseCompsParsedDataMultiReturn {
  rawDataByComp: RawDataMap;
  isLoading: boolean;
}

function jsonRecord(v: unknown): Record<string, unknown> {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export function useCompsParsedDataMulti(
  projectId: string,
  compIds: string[],
): UseCompsParsedDataMultiReturn {
  const [rawDataByComp, setRawDataByComp] = useState<RawDataMap>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);
  const compIdsKey = compIds.join(",");

  const loadAll = useCallback(async () => {
    if (!projectId || compIds.length === 0) {
      setRawDataByComp(new Map());
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    try {
      const supabase = createClient();
      const result = await supabase
        .from("comp_parsed_data")
        .select("comp_id, raw_data")
        .eq("project_id", projectId)
        .in("comp_id", compIds);

      if (result.error) throw result.error;

      if (isMountedRef.current) {
        const m = new Map<string, Record<string, unknown>>();
        for (const row of result.data ?? []) {
          if (typeof row.comp_id === "string") {
            m.set(row.comp_id, jsonRecord(row.raw_data));
          }
        }
        setRawDataByComp(m);
      }
    } catch {
      /* keep stale data on error */
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, compIdsKey]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadAll();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadAll]);

  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`comp_parsed_data_multi:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comp_parsed_data",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (!isMountedRef.current) return;
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<string, unknown>;
          const compId = row.comp_id;
          if (typeof compId !== "string") return;

          setRawDataByComp((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") {
              next.delete(compId);
            } else {
              next.set(compId, jsonRecord(row.raw_data));
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [projectId]);

  return { rawDataByComp, isLoading };
}
