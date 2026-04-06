import "server-only";

export interface CompCandidate {
  address: string;
  instrumentNumber?: string | null;
  apn?: string | string[] | null;
  type: "Land" | "Sales" | "Rentals";
  projectId: string;
  /** Index in the extracted comp array */
  index?: number;
}

export interface CompMatch {
  candidate: CompCandidate;
  matchedRefCompId: string;
  matchType: "instrument_number" | "address" | "address+apn";
  /** 0–1 */
  confidence: number;
}

export interface RefLibComp {
  id: string;
  address: string;
  instrumentNumber: string | null;
  apn: unknown;
  type: string;
  rawData: Record<string, unknown>;
}

const TOKEN_ALIASES: Record<string, string> = {
  street: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  boulevard: "blvd",
  blvd: "blvd",
  drive: "dr",
  dr: "dr",
  road: "rd",
  rd: "rd",
  lane: "ln",
  ln: "ln",
  court: "ct",
  ct: "ct",
  circle: "cir",
  cir: "cir",
  place: "pl",
  pl: "pl",
  highway: "hwy",
  hwy: "hwy",
  north: "n",
  n: "n",
  south: "s",
  s: "s",
  east: "e",
  e: "e",
  west: "w",
  w: "w",
};

function stripTrailingGeoAndZip(s: string): string {
  let t = s.trim();
  t = t.replace(/,\s*usa\s*$/i, "").trim();
  t = t.replace(/\s+usa\s*$/i, "").trim();
  t = t.replace(/,?\s+[a-z]{2}\s+\d{5}(-\d{4})?\s*$/i, "").trim();
  t = t.replace(/,?\s+[a-z]{2}\s*$/i, "").trim();
  t = t.replace(/\s+\d{5}(-\d{4})?\s*$/i, "").trim();
  return t;
}

/**
 * Normalizes a US-style street address for fuzzy equality checks.
 *
 * @example
 * `"16580 S WEST WIND AVE ODESSA 79766"` → `"16580 s west wind ave odessa"`
 *
 * @example
 * `"341 E Tammy Dr, Odessa, TX 79766, USA"` → `"341 e tammy dr odessa"`
 */
export function normalizeAddress(addr: string): string {
  const lower = addr.trim().toLowerCase();
  const withoutGeo = stripTrailingGeoAndZip(lower);
  const noPunct = withoutGeo.replace(/[^a-z0-9\s-]/g, " ");
  const collapsed = noPunct.replace(/\s+/g, " ").trim();
  if (collapsed === "") {
    return "";
  }
  const tokens = collapsed.split(" ");
  const mapped = tokens.map((tok) => TOKEN_ALIASES[tok] ?? tok);
  return mapped.join(" ");
}

function normalizeInstrument(n: string | null | undefined): string | null {
  if (n == null) {
    return null;
  }
  const t = n.trim();
  return t === "" ? null : t.toLowerCase();
}

function refTypeMatchesCandidate(refType: string, candidateType: CompCandidate["type"]): boolean {
  const u = refType.trim().toLowerCase();
  if (u === "land") {
    return candidateType === "Land";
  }
  if (u === "sales") {
    return candidateType === "Sales";
  }
  if (u === "rental" || u === "rentals") {
    return candidateType === "Rentals";
  }
  return refType === candidateType;
}

function filterRefByType(
  refs: RefLibComp[],
  candidateType: CompCandidate["type"],
): RefLibComp[] {
  return refs.filter((r) => refTypeMatchesCandidate(r.type, candidateType));
}

interface ApnCarrier {
  apn: unknown;
}

function isApnCarrier(v: unknown): v is ApnCarrier {
  return typeof v === "object" && v !== null && "apn" in v;
}

/** Uppercase APNs with spaces and hyphens removed (for equality). */
export function normalizeApnToken(s: string): string {
  return s.replace(/[\s-]/g, "").toUpperCase();
}

function collectRawApnStrings(apn: unknown): string[] {
  if (apn == null) {
    return [];
  }
  if (typeof apn === "string") {
    return apn === "" ? [] : [apn];
  }
  if (Array.isArray(apn)) {
    const out: string[] = [];
    for (const item of apn) {
      if (typeof item === "string") {
        if (item !== "") {
          out.push(item);
        }
      } else if (isApnCarrier(item) && typeof item.apn === "string" && item.apn !== "") {
        out.push(item.apn);
      }
    }
    return out;
  }
  return [];
}

/**
 * Collects APN strings from heterogeneous shapes (`string`, `string[]`, `{ apn }[]`, etc.).
 * Each value is normalized: uppercase, spaces and hyphens removed.
 */
export function extractApnStrings(apn: unknown): string[] {
  const raw = collectRawApnStrings(apn);
  const normalized = raw.map(normalizeApnToken).filter((s) => s !== "");
  return [...new Set(normalized)];
}

function normalizedApnSetFromUnknown(apnField: unknown, rawData: Record<string, unknown>): Set<string> {
  return new Set([...extractApnStrings(apnField), ...extractApnStrings(rawData.APN)]);
}

function candidateApnSet(candidate: CompCandidate): Set<string> {
  return new Set(extractApnStrings(candidate.apn ?? null));
}

function apnOverlaps(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) {
    if (b.has(x)) {
      return true;
    }
  }
  return false;
}

/**
 * Matches extracted / candidate comps to Reference Library comps: instrument number first, then address.
 * The same ref comp may match multiple candidates (same comp cited across projects).
 */
export function matchComps(
  candidates: CompCandidate[],
  refLibraryComps: RefLibComp[],
): { matched: CompMatch[]; unmatched: CompCandidate[] } {
  const matched: CompMatch[] = [];
  const unmatchedAfterInstrument: CompCandidate[] = [];

  for (const candidate of candidates) {
    const candInstr = normalizeInstrument(candidate.instrumentNumber ?? null);
    const refsTyped = filterRefByType(refLibraryComps, candidate.type);
    if (candInstr !== null) {
      const hit = refsTyped.find(
        (r) => normalizeInstrument(r.instrumentNumber) === candInstr,
      );
      if (hit) {
        matched.push({
          candidate,
          matchedRefCompId: hit.id,
          matchType: "instrument_number",
          confidence: 1,
        });
        continue;
      }
    }
    unmatchedAfterInstrument.push(candidate);
  }

  const stillUnmatched: CompCandidate[] = [];

  for (const candidate of unmatchedAfterInstrument) {
    const normAddr = normalizeAddress(candidate.address);
    if (normAddr === "") {
      stillUnmatched.push(candidate);
      continue;
    }
    const refsTyped = filterRefByType(refLibraryComps, candidate.type);
    const addressHits = refsTyped.filter((r) => normalizeAddress(r.address) === normAddr);

    if (addressHits.length === 0) {
      stillUnmatched.push(candidate);
      continue;
    }

    if (addressHits.length === 1) {
      const hit = addressHits[0]!;
      matched.push({
        candidate,
        matchedRefCompId: hit.id,
        matchType: "address",
        confidence: 0.9,
      });
      continue;
    }

    const candApns = candidateApnSet(candidate);
    const withApn = addressHits.filter((r) => {
      const rApns = normalizedApnSetFromUnknown(r.apn, r.rawData);
      return candApns.size > 0 && apnOverlaps(candApns, rApns);
    });

    if (withApn.length === 1) {
      const hit = withApn[0]!;
      matched.push({
        candidate,
        matchedRefCompId: hit.id,
        matchType: "address+apn",
        confidence: 0.85,
      });
      continue;
    }

    const fallback = addressHits[0]!;
    matched.push({
      candidate,
      matchedRefCompId: fallback.id,
      matchType: "address",
      confidence: 0.7,
    });
  }

  return { matched, unmatched: stillUnmatched };
}
