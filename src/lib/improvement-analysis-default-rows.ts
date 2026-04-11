import type {
  ImprovementAnalysisRow,
  ImprovementCategory,
} from "~/types/comp-data";

const CATEGORY_ORDER: ImprovementCategory[] = [
  "Improvement Characteristics",
  "Ratios & Parking",
  "Age/Life",
  "Structural Characteristics",
  "Interior Characteristics",
  "Mechanical Systems",
  "Site Improvements",
  "Legal/Conforming Status",
];

function isImprovementCategory(v: unknown): v is ImprovementCategory {
  return typeof v === "string" && (CATEGORY_ORDER as string[]).includes(v);
}

/**
 * Default Improvement Analysis row template (matches Improvement Analysis Editor).
 */
export function buildDefaultImprovementAnalysisRows(): ImprovementAnalysisRow[] {
  const add = (
    category: ImprovementCategory,
    labels: string[],
  ): ImprovementAnalysisRow[] =>
    labels.map((label) => ({
      label,
      category,
      include: true,
      value: "",
    }));

  return [
    ...add("Improvement Characteristics", [
      "Property Type",
      "Property Subtype",
      "Occupancy",
    ]),
    {
      label: "Investment Class",
      category: "Improvement Characteristics",
      include: false,
      value: "",
    },
    ...add("Improvement Characteristics", [
      "Number of Buildings",
      "Number of Stories",
      "Construction Class",
      "Construction Quality",
      "Gross Building Area (GBA)",
      "Net Rentable Area (NRA)",
    ]),
    ...add("Ratios & Parking", [
      "Land/Bld Ratio",
      "Floor Area Ratio",
      "Parking (SF)",
      "Parking Spaces",
      "Parking Ratio",
    ]),
    ...add("Age/Life", [
      "Year Built",
      "Condition",
      "Age",
      "Effective Age",
      "Typical Building Life",
      "Remaining Economic Life",
    ]),
    ...add("Structural Characteristics", [
      "Foundation",
      "Roof Type/Material",
      "Building Frame",
      "Exterior Walls",
    ]),
    ...add("Interior Characteristics", [
      "Floors",
      "Walls",
      "Ceiling",
      "Lighting",
      "Restrooms",
    ]),
    ...add("Mechanical Systems", [
      "Electrical",
      "Plumbing",
      "Heating",
      "Air Conditioning",
      "Fire Protection/Sprinklers",
      "Number of Elevators",
    ]),
    ...add("Site Improvements", ["Site Improvements", "Landscaping"]),
    ...add("Legal/Conforming Status", [
      "Legally Permitted Use",
      "Conforms to Parking",
      "Conformity Conclusion",
    ]),
  ];
}

function asDisplayString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** Normalize `subject_data.improvement_analysis` JSONB into row objects. */
export function normalizeImprovementAnalysisFromDb(
  raw: unknown,
): ImprovementAnalysisRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === "object")
    .map((x) => ({
      label: asDisplayString(x.label),
      category: isImprovementCategory(x.category)
        ? x.category
        : "Improvement Characteristics",
      include: Boolean(x.include),
      value: asDisplayString(x.value),
    }));
}
