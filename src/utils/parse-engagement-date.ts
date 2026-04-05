import { isValid, parse, parseISO } from "date-fns";

const DATE_PARSE_REF = new Date(2000, 0, 1);

/** Parses engagement / project date strings (ISO, M/d/yyyy, long month, parseISO). */
export function parseEngagementDateToDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = parse(trimmed, "yyyy-MM-dd", DATE_PARSE_REF);
    return isValid(d) ? d : null;
  }

  // US slash dates (common in DB: MM/dd/yyyy from backfill / engagement)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    for (const fmt of ["MM/dd/yyyy", "M/d/yyyy", "MM/d/yyyy", "M/dd/yyyy"] as const) {
      const d = parse(trimmed, fmt, DATE_PARSE_REF);
      if (isValid(d)) return d;
    }
  }

  // ISO date-time from APIs / exports (use date portion)
  const isoDatePrefix = /^(\d{4}-\d{2}-\d{2})[Tt ]/.exec(trimmed);
  if (isoDatePrefix?.[1]) {
    const d = parse(isoDatePrefix[1], "yyyy-MM-dd", DATE_PARSE_REF);
    if (isValid(d)) return d;
  }

  const iso = parseISO(trimmed);
  if (isValid(iso)) return iso;

  for (const fmt of ["MMMM d, yyyy", "MMM d, yyyy"] as const) {
    const d = parse(trimmed, fmt, DATE_PARSE_REF);
    if (isValid(d)) return d;
  }

  return null;
}
