"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "~/utils/supabase/client";
import type { CompParsedDataRow, LandSaleData, SaleData, RentalData } from "~/types/comp-data";

export interface UseCompParsedDataReturn {
  parsedData: CompParsedDataRow | null;
  isLoading: boolean;
  error: string | null;
  saveParsedData: (rawData: LandSaleData | SaleData | RentalData | Record<string, unknown>) => Promise<void>;
  refreshParsedData: () => Promise<void>;
}

export function useCompParsedData(compId: string): UseCompParsedDataReturn {
  const [parsedData, setParsedData] = useState<CompParsedDataRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const loadParsedData = useCallback(async () => {
    if (!compId) {
      setParsedData(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const result = await supabase
        .from("comp_parsed_data")
        .select("*")
        .eq("comp_id", compId)
        .maybeSingle();

      if (result.error) throw result.error;

      if (isMountedRef.current) {
        setParsedData(result.data as CompParsedDataRow | null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load parsed data");
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [compId]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadParsedData();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadParsedData]);

  // Realtime subscription
  useEffect(() => {
    if (!compId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`comp_parsed_data:${compId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comp_parsed_data",
          filter: `comp_id=eq.${compId}`,
        },
        (payload) => {
          if (!isMountedRef.current) return;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setParsedData(payload.new as CompParsedDataRow);
          } else if (payload.eventType === "DELETE") {
            setParsedData(null);
          }
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [compId]);

  const saveParsedData = useCallback(
    async (rawData: LandSaleData | SaleData | RentalData | Record<string, unknown>) => {
      if (!compId) return;

      const supabase = createClient();
      const upsertResult = await supabase
        .from("comp_parsed_data")
        .upsert(
          {
            comp_id: compId,
            raw_data: rawData as unknown as Record<string, unknown>,
            source: "manual",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "comp_id" },
        )
        .select()
        .single();

      if (upsertResult.error) {
        throw new Error(upsertResult.error.message);
      }

      if (isMountedRef.current) {
        setParsedData(upsertResult.data as CompParsedDataRow);
      }
    },
    [compId],
  );

  return {
    parsedData,
    isLoading,
    error,
    saveParsedData,
    refreshParsedData: loadParsedData,
  };
}
