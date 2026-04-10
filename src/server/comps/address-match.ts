import "server-only";

/**
 * Normalize address for grouping / matching comps (case, spaces, leading zeros on
 * street numbers so "0000 Saybrook" aligns with "0 Saybrook" when needed).
 */
export function normalizeAddressForCompMatch(address: string): string {
  const t = address.trim().toLowerCase().replace(/\s+/g, " ");
  const m = /^(\d+)(\s+.+)$/.exec(t);
  if (!m?.[1] || m[2] === undefined) return t;
  const n = String(parseInt(m[1], 10));
  return `${n}${m[2]}`;
}
