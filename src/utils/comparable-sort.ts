/**
 * Sort rules for comparables — shared by client (`getComparablesByType`) and
 * server (`getCompDocumentSectionTag`) so section tags stay aligned with UI order.
 */

export interface ComparableSortable {
  number?: string | null;
  address: string;
}

export function comparableNumberSortKey(comp: {
  number?: string | null;
}): number {
  const raw = comp.number?.trim();
  if (!raw) return Number.POSITIVE_INFINITY;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function sortComparables<T extends ComparableSortable>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ka = comparableNumberSortKey(a);
    const kb = comparableNumberSortKey(b);
    if (ka !== kb) return ka - kb;
    return a.address.localeCompare(b.address, undefined, {
      sensitivity: "base",
    });
  });
}
