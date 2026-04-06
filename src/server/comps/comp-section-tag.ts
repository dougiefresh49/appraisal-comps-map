import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompType } from "~/types/comp-data";
import { sortComparables } from "~/utils/comparable-sort";

type ComparableRow = {
  id: string;
  type: string;
  number: string | null;
  address: string;
};

function compTypeToDbType(type: CompType): "Land" | "Sales" | "Rentals" {
  switch (type) {
    case "land":
      return "Land";
    case "sales":
      return "Sales";
    case "rentals":
      return "Rentals";
  }
}

/**
 * Matches CompDetailPage `compSectionTag` + displayNumber (number or sorted 1-based index).
 */
export async function getCompDocumentSectionTag(
  supabase: SupabaseClient,
  projectId: string,
  compId: string,
  compType: CompType,
): Promise<string | null> {
  const dbType = compTypeToDbType(compType);
  const { data, error } = await supabase
    .from("comparables")
    .select("id, type, number, address")
    .eq("project_id", projectId)
    .eq("type", dbType);

  if (error || !data?.length) {
    if (error) {
      console.error("[getCompDocumentSectionTag] query failed:", error.message);
    }
    return null;
  }

  const rows = data as ComparableRow[];
  const sorted = sortComparables(rows);
  const idx = sorted.findIndex((r) => r.id === compId);
  if (idx < 0) return null;

  const row = sorted[idx]!;
  const displayNumber =
    row.number?.trim() !== "" && row.number != null
      ? row.number.trim()
      : String(idx + 1);

  return `${compType}-comp-${displayNumber}`;
}
