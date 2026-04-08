/**
 * Canonical photo categories for AI classification and UI pickers.
 * Kept in a client-safe module (not `server-only`).
 */
export const VALID_CATEGORIES = [
  "Site & Grounds",
  "Building Exterior",
  "Building Interior",
  "Residential / Apartment Unit",
  "Damage & Deferred Maintenance",
] as const;

export type PhotoCategory = (typeof VALID_CATEGORIES)[number];
