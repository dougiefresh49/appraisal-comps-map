"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "~/utils/supabase/client";

// ---------------------------------------------------------------------------
// Row types (snake_case from Supabase)
// ---------------------------------------------------------------------------

export interface CompParcelRow {
  id: string;
  comp_id: string | null;
  project_id: string;
  instrument_number: string | null;
  apn: string;
  apn_link: string | null;
  location: string | null;
  legal: string | null;
  lot_number: string | null;
  size_ac: number | null;
  size_sf: number | null;
  building_size_sf: number | null;
  office_area_sf: number | null;
  warehouse_area_sf: number | null;
  parking_sf: number | null;
  storage_area_sf: number | null;
  buildings: number | null;
  total_tax_amount: number | null;
  county_appraised_value: number | null;
  created_at: string;
  updated_at: string;
}

export interface CompParcelImprovementRow {
  id: string;
  parcel_id: string | null;
  comp_id: string | null;
  project_id: string;
  instrument_number: string | null;
  apn: string;
  building_number: number;
  section_number: number;
  year_built: number | null;
  effective_year_built: number | null;
  gross_building_area_sf: number | null;
  office_area_sf: number | null;
  warehouse_area_sf: number | null;
  parking_sf: number | null;
  storage_area_sf: number | null;
  is_gla: boolean;
  construction: string | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
}

export type CompParcelPatch = Partial<Omit<CompParcelRow, "id" | "comp_id" | "project_id" | "created_at" | "updated_at">>;
export type CompParcelImprovementPatch = Partial<Omit<CompParcelImprovementRow, "id" | "comp_id" | "project_id" | "parcel_id" | "created_at" | "updated_at">>;

export interface UseCompParcelsReturn {
  parcels: CompParcelRow[];
  improvements: CompParcelImprovementRow[];
  isLoading: boolean;
  error: string | null;
  updateParcel: (id: string, patch: CompParcelPatch) => Promise<void>;
  updateImprovement: (id: string, patch: CompParcelImprovementPatch) => Promise<void>;
  deleteParcel: (id: string) => Promise<void>;
  deleteImprovement: (id: string) => Promise<void>;
  addParcel: (patch?: Partial<CompParcelPatch>) => Promise<void>;
  addImprovement: (parcelId: string | null, patch?: Partial<CompParcelImprovementPatch>) => Promise<void>;
  refreshParcels: () => Promise<void>;
}

export function useCompParcels(compId: string): UseCompParcelsReturn {
  const [parcels, setParcels] = useState<CompParcelRow[]>([]);
  const [improvements, setImprovements] = useState<CompParcelImprovementRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const loadParcels = useCallback(async () => {
    if (!compId) {
      setParcels([]);
      setImprovements([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      const [parcelResult, improvResult] = await Promise.all([
        supabase
          .from("comp_parcels")
          .select("*")
          .eq("comp_id", compId)
          .order("apn", { ascending: true }),
        supabase
          .from("comp_parcel_improvements")
          .select("*")
          .eq("comp_id", compId)
          .order("building_number", { ascending: true })
          .order("section_number", { ascending: true }),
      ]);

      if (parcelResult.error) throw parcelResult.error;
      if (improvResult.error) throw improvResult.error;

      if (isMountedRef.current) {
        setParcels((parcelResult.data ?? []) as CompParcelRow[]);
        setImprovements((improvResult.data ?? []) as CompParcelImprovementRow[]);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load parcel data");
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [compId]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadParcels();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadParcels]);

  // Realtime: comp_parcels
  useEffect(() => {
    if (!compId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`comp_parcels:${compId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comp_parcels",
          filter: `comp_id=eq.${compId}`,
        },
        (payload) => {
          if (!isMountedRef.current) return;
          if (payload.eventType === "INSERT") {
            setParcels((prev) => [...prev, payload.new as CompParcelRow]);
          } else if (payload.eventType === "UPDATE") {
            setParcels((prev) =>
              prev.map((p) =>
                p.id === (payload.new as CompParcelRow).id
                  ? (payload.new as CompParcelRow)
                  : p,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            setParcels((prev) =>
              prev.filter((p) => p.id !== (payload.old as { id: string }).id),
            );
          }
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [compId]);

  // Realtime: comp_parcel_improvements
  useEffect(() => {
    if (!compId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`comp_parcel_improvements:${compId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comp_parcel_improvements",
          filter: `comp_id=eq.${compId}`,
        },
        (payload) => {
          if (!isMountedRef.current) return;
          if (payload.eventType === "INSERT") {
            setImprovements((prev) => [
              ...prev,
              payload.new as CompParcelImprovementRow,
            ]);
          } else if (payload.eventType === "UPDATE") {
            setImprovements((prev) =>
              prev.map((imp) =>
                imp.id === (payload.new as CompParcelImprovementRow).id
                  ? (payload.new as CompParcelImprovementRow)
                  : imp,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            setImprovements((prev) =>
              prev.filter(
                (imp) => imp.id !== (payload.old as { id: string }).id,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [compId]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const updateParcel = useCallback(
    async (id: string, patch: CompParcelPatch) => {
      const supabase = createClient();
      const result = await supabase
        .from("comp_parcels")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      if (isMountedRef.current) {
        setParcels((prev) =>
          prev.map((p) =>
            p.id === id ? (result.data as CompParcelRow) : p,
          ),
        );
      }
    },
    [],
  );

  const updateImprovement = useCallback(
    async (id: string, patch: CompParcelImprovementPatch) => {
      const supabase = createClient();
      const result = await supabase
        .from("comp_parcel_improvements")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      if (isMountedRef.current) {
        setImprovements((prev) =>
          prev.map((imp) =>
            imp.id === id ? (result.data as CompParcelImprovementRow) : imp,
          ),
        );
      }
    },
    [],
  );

  const deleteParcel = useCallback(async (id: string) => {
    const supabase = createClient();
    const result = await supabase
      .from("comp_parcels")
      .delete()
      .eq("id", id);
    if (result.error) throw new Error(result.error.message);
    if (isMountedRef.current) {
      setParcels((prev) => prev.filter((p) => p.id !== id));
      setImprovements((prev) => prev.filter((imp) => imp.parcel_id !== id));
    }
  }, []);

  const deleteImprovement = useCallback(async (id: string) => {
    const supabase = createClient();
    const result = await supabase
      .from("comp_parcel_improvements")
      .delete()
      .eq("id", id);
    if (result.error) throw new Error(result.error.message);
    if (isMountedRef.current) {
      setImprovements((prev) => prev.filter((imp) => imp.id !== id));
    }
  }, []);

  const addParcel = useCallback(
    async (patch: Partial<CompParcelPatch> = {}) => {
      if (!compId) return;
      const supabase = createClient();
      // Need project_id — fetch it from an existing parcel or from the comparables row
      const compResult = await supabase
        .from("comparables")
        .select("project_id")
        .eq("id", compId)
        .single();
      if (compResult.error) throw new Error(compResult.error.message);
      const projectId = (compResult.data as { project_id: string }).project_id;

      const result = await supabase
        .from("comp_parcels")
        .insert({ comp_id: compId, project_id: projectId, apn: "", ...patch })
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      if (isMountedRef.current) {
        setParcels((prev) => [...prev, result.data as CompParcelRow]);
      }
    },
    [compId],
  );

  const addImprovement = useCallback(
    async (
      parcelId: string | null,
      patch: Partial<CompParcelImprovementPatch> = {},
    ) => {
      if (!compId) return;
      const supabase = createClient();

      const compResult = await supabase
        .from("comparables")
        .select("project_id")
        .eq("id", compId)
        .single();
      if (compResult.error) throw new Error(compResult.error.message);
      const projectId = (compResult.data as { project_id: string }).project_id;

      const result = await supabase
        .from("comp_parcel_improvements")
        .insert({
          comp_id: compId,
          project_id: projectId,
          parcel_id: parcelId,
          apn: "",
          building_number: 1,
          section_number: 1,
          is_gla: true,
          construction: "",
          ...patch,
        })
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      if (isMountedRef.current) {
        setImprovements((prev) => [
          ...prev,
          result.data as CompParcelImprovementRow,
        ]);
      }
    },
    [compId],
  );

  return {
    parcels,
    improvements,
    isLoading,
    error,
    updateParcel,
    updateImprovement,
    deleteParcel,
    deleteImprovement,
    addParcel,
    addImprovement,
    refreshParcels: loadParcels,
  };
}
