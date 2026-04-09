"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "~/utils/supabase/client";
import type { CompParsedDataRow, LandSaleData, SaleData, RentalData } from "~/types/comp-data";

/**
 * Maps detail-form `raw_data` onto `comparables` columns (mirrors
 * comparableRowPatchFromCompData in ~/lib/comp-parser.ts). Only non-empty
 * values are included so partial saves do not wipe list fields.
 */
function comparableRowPatchFromRawData(
  rawData: LandSaleData | SaleData | RentalData | Record<string, unknown>,
): {
  address?: string;
  address_for_display?: string;
  apn?: string[];
  instrument_number?: string;
} {
  const row = rawData as Record<string, unknown>;
  const patch: {
    address?: string;
    address_for_display?: string;
    apn?: string[];
    instrument_number?: string;
  } = {};

  const address = typeof row.Address === "string" ? row.Address.trim() : "";
  if (address) {
    patch.address = address;
    patch.address_for_display = address;
  }

  const apnVal = row.APN;
  if (typeof apnVal === "string" && apnVal.trim()) {
    patch.apn = apnVal
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const rec = row.Recording;
  if (typeof rec === "string" && rec.trim()) {
    patch.instrument_number = rec.trim();
  }

  return patch;
}

export interface UseCompParsedDataReturn {
  parsedData: CompParsedDataRow | null;
  isLoading: boolean;
  error: string | null;
  saveParsedData: (rawData: LandSaleData | SaleData | RentalData | Record<string, unknown>) => Promise<void>;
  /** Accept a merged re-parse result: updates raw_data, clears proposed_raw_data, sets status to "parsed". */
  clearProposedData: (mergedRawData: LandSaleData | SaleData | RentalData | Record<string, unknown>) => Promise<void>;
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

      const comparablesPatch = comparableRowPatchFromRawData(rawData);
      if (Object.keys(comparablesPatch).length > 0) {
        const comparablesResult = await supabase
          .from("comparables")
          .update(comparablesPatch)
          .eq("id", compId);
        if (comparablesResult.error) {
          throw new Error(comparablesResult.error.message);
        }
      }

      if (isMountedRef.current) {
        setParsedData(upsertResult.data as CompParsedDataRow);
      }
    },
    [compId],
  );

  const clearProposedData = useCallback(
    async (mergedRawData: LandSaleData | SaleData | RentalData | Record<string, unknown>) => {
      if (!compId) return;

      const supabase = createClient();
      const updateResult = await supabase
        .from("comp_parsed_data")
        .update({
          raw_data: mergedRawData as unknown as Record<string, unknown>,
          proposed_raw_data: null,
          source: "manual",
          updated_at: new Date().toISOString(),
        })
        .eq("comp_id", compId)
        .select()
        .single();

      if (updateResult.error) {
        throw new Error(updateResult.error.message);
      }

      const comparablesPatch = comparableRowPatchFromRawData(mergedRawData);
      const statusResult = await supabase
        .from("comparables")
        .update({
          parsed_data_status: "parsed",
          ...comparablesPatch,
        })
        .eq("id", compId);

      if (statusResult.error) {
        throw new Error(statusResult.error.message);
      }

      if (isMountedRef.current) {
        setParsedData(updateResult.data as CompParsedDataRow);
      }
    },
    [compId],
  );

  return {
    parsedData,
    isLoading,
    error,
    saveParsedData,
    clearProposedData,
    refreshParsedData: loadParsedData,
  };
}
