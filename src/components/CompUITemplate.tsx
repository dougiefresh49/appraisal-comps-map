"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProject } from "~/hooks/useProject";
import { useCompParsedData } from "~/hooks/useCompParsedData";
import type { Comparable } from "~/utils/projectStore";

export type CompUITemplateType = "Land" | "Sales" | "Rentals";

export interface CompTemplateRow {
  label: string;
  fieldKey: string;
  include: boolean;
}

function getDefaultTemplateRows(compType: CompUITemplateType): CompTemplateRow[] {
  const row = (label: string, fieldKey: string): CompTemplateRow => ({
    label,
    fieldKey,
    include: true,
  });

  if (compType === "Land") {
    return [
      row("Address", "Address"),
      row("APN", "APN"),
      row("Legal", "Legal"),
      row("Land Size (AC)", "Land Size (AC)"),
      row("Zoning", "Zoning"),
      row("Sale Price", "Sale Price"),
      row("Date of Sale", "Date of Sale"),
      row("Recording", "Recording"),
      row("Grantor", "Grantor"),
      row("Grantee", "Grantee"),
      row("Sale Price / AC", "Sale Price / AC"),
      row("Sale Price / SF", "Sale Price / SF"),
      row("Corner", "Corner"),
      row("Highway Frontage", "Highway Frontage"),
      row("Utils - Electricity", "Utils - Electricity"),
      row("Utils - Water", "Utils - Water"),
      row("Utils - Sewer", "Utils - Sewer"),
      row("Surface", "Surface"),
      row("Comments", "Comments"),
    ];
  }

  if (compType === "Sales") {
    return [
      row("Address", "Address"),
      row("APN", "APN"),
      row("Legal", "Legal"),
      row("Property Type", "Property Type"),
      row("Building Size (SF)", "Building Size (SF)"),
      row("Land Size (AC)", "Land Size (AC)"),
      row("Year Built", "Year Built"),
      row("Condition", "Condition"),
      row("Sale Price", "Sale Price"),
      row("Date of Sale", "Date of Sale"),
      row("Recording", "Recording"),
      row("Sale Price / SF", "Sale Price / SF"),
      row("Overall Cap Rate", "Overall Cap Rate"),
      row("Gross Income Multiplier", "Gross Income Multiplier"),
      row("Comments", "Comments"),
    ];
  }

  return [
    row("Address", "Address"),
    row("APN", "APN"),
    row("Legal", "Legal"),
    row("Rentable SF", "Rentable SF"),
    row("Land Size (AC)", "Land Size (AC)"),
    row("Year Built", "Year Built"),
    row("Condition", "Condition"),
    row("Lessor", "Lessor"),
    row("Tenant", "Tenant"),
    row("Lease Start", "Lease Start"),
    row("Rent / Month", "Rent / Month"),
    row("Rent / SF / Year", "Rent / SF / Year"),
    row("Expense Structure", "Expense Structure"),
    row("Comments", "Comments"),
  ];
}

const INDICATOR_KEYS: Record<CompUITemplateType, Set<string>> = {
  Land: new Set(["Sale Price / AC", "Sale Price / SF"]),
  Sales: new Set([
    "Sale Price / SF",
    "Overall Cap Rate",
    "Gross Income Multiplier",
  ]),
  Rentals: new Set(["Rent / Month", "Rent / SF / Year"]),
};

interface SectionDef {
  title: string;
  keys: string[];
}

const LEFT_SECTIONS: Record<CompUITemplateType, SectionDef[]> = {
  Land: [
    {
      title: "Property Information",
      keys: [
        "Address",
        "APN",
        "Legal",
        "Land Size (AC)",
        "Zoning",
        "Corner",
        "Highway Frontage",
      ],
    },
    {
      title: "Utilities & Surface",
      keys: [
        "Utils - Electricity",
        "Utils - Water",
        "Utils - Sewer",
        "Surface",
      ],
    },
    {
      title: "Sale Information",
      keys: [
        "Sale Price",
        "Date of Sale",
        "Recording",
        "Grantor",
        "Grantee",
      ],
    },
  ],
  Sales: [
    {
      title: "Property Information",
      keys: [
        "Address",
        "APN",
        "Legal",
        "Property Type",
        "Building Size (SF)",
        "Land Size (AC)",
        "Year Built",
        "Condition",
      ],
    },
    {
      title: "Sale Information",
      keys: ["Sale Price", "Date of Sale", "Recording"],
    },
  ],
  Rentals: [
    {
      title: "Property & Lease",
      keys: [
        "Address",
        "APN",
        "Legal",
        "Rentable SF",
        "Land Size (AC)",
        "Year Built",
        "Condition",
        "Lessor",
        "Tenant",
        "Lease Start",
        "Expense Structure",
      ],
    },
  ],
};

function formatRawValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return "";
}

function readRawField(
  raw: Record<string, unknown> | undefined,
  fieldKey: string,
): string {
  if (!raw) return "";
  return formatRawValue(raw[fieldKey]);
}

function SectionRenderer({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string; highlight?: boolean }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-2 border-b border-gray-300 bg-gray-100 px-2 py-1 text-sm font-bold uppercase text-gray-900">
        {title}
      </h3>
      <div className="px-2">
        {items.map((item, idx) => (
          <div
            key={`${item.label}-${idx}`}
            className="mb-1 grid grid-cols-[140px_1fr] gap-4 text-sm"
          >
            <div className="text-gray-600">{item.label}</div>
            <div
              className={`whitespace-pre-wrap text-gray-900 ${
                item.highlight ? "font-bold" : ""
              }`}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildLeftSections(
  compType: CompUITemplateType,
  detailRows: CompTemplateRow[],
  raw: Record<string, unknown>,
): { title: string; items: { label: string; value: string }[] }[] {
  const sectionDefs = LEFT_SECTIONS[compType];
  const allDefKeys = new Set(sectionDefs.flatMap((d) => d.keys));
  const result: { title: string; items: { label: string; value: string }[] }[] =
    [];

  for (const def of sectionDefs) {
    const items = detailRows
      .filter((r) => def.keys.includes(r.fieldKey))
      .map((r) => ({
        label: r.label,
        value: readRawField(raw, r.fieldKey),
      }));
    if (items.length > 0) {
      result.push({ title: def.title, items });
    }
  }

  const orphanRows = detailRows.filter((r) => !allDefKeys.has(r.fieldKey));
  if (orphanRows.length > 0) {
    result.push({
      title: "Additional details",
      items: orphanRows.map((r) => ({
        label: r.label,
        value: readRawField(raw, r.fieldKey),
      })),
    });
  }

  return result;
}

function titleForCompType(compType: CompUITemplateType): string {
  if (compType === "Land") return "COMPARABLE LAND SALE";
  if (compType === "Sales") return "COMPARABLE SALE";
  return "COMPARABLE LEASE";
}

export interface CompUITemplateProps {
  projectId: string;
  compType: CompUITemplateType;
  typeSlug: string;
}

export function CompUITemplate({
  projectId,
  compType,
  typeSlug,
}: CompUITemplateProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);
  const { project, isLoading: projectLoading } = useProject(projectId);

  const [rows, setRows] = useState<CompTemplateRow[]>(() =>
    getDefaultTemplateRows(compType),
  );
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    setRows(getDefaultTemplateRows(compType));
  }, [compType]);

  const comparables = useMemo(() => {
    if (!project) return [];
    return project.comparables.filter((c) => c.type === compType);
  }, [project, compType]);

  const urlCompId = searchParams.get("compId");
  const selectedCompId = useMemo(() => {
    if (urlCompId && comparables.some((c) => c.id === urlCompId)) {
      return urlCompId;
    }
    return comparables[0]?.id ?? "";
  }, [urlCompId, comparables]);

  useEffect(() => {
    if (comparables.length === 0) return;
    if (urlCompId && comparables.some((c) => c.id === urlCompId)) return;
    const first = comparables[0]?.id;
    if (!first) return;
    router.replace(
      `/project/${projectId}/${typeSlug}/ui?compId=${encodeURIComponent(first)}`,
    );
  }, [comparables, urlCompId, projectId, typeSlug, router]);

  const { parsedData, isLoading: parsedLoading } =
    useCompParsedData(selectedCompId);

  const rawData = useMemo(() => {
    const r = parsedData?.raw_data;
    if (r && typeof r === "object" && !Array.isArray(r)) {
      return r as Record<string, unknown>;
    }
    return {} as Record<string, unknown>;
  }, [parsedData]);

  const dataKeys = useMemo(
    () => Object.keys(rawData).sort((a, b) => a.localeCompare(b)),
    [rawData],
  );

  const selectedComp: Comparable | undefined = comparables.find(
    (c) => c.id === selectedCompId,
  );
  const displayIndex =
    selectedCompId === ""
      ? 1
      : Math.max(1, comparables.findIndex((c) => c.id === selectedCompId) + 1);

  const imageUrl =
    selectedComp?.images?.[0]?.webViewLink ??
    selectedComp?.images?.[0]?.webViewUrl;

  const includedRows = useMemo(
    () => rows.filter((r) => r.include),
    [rows],
  );

  const indicators = INDICATOR_KEYS[compType];
  const indicatorRows = includedRows.filter((r) => indicators.has(r.fieldKey));
  const commentsRow = includedRows.find((r) => r.fieldKey === "Comments");
  const detailRows = includedRows.filter(
    (r) => r.fieldKey !== "Comments" && !indicators.has(r.fieldKey),
  );

  const leftSections = buildLeftSections(compType, detailRows, rawData);

  const keyIndicatorItems = indicatorRows.map((r) => ({
    label: r.label,
    value: readRawField(rawData, r.fieldKey),
    highlight: true,
  }));

  const copyHtml = useCallback(async () => {
    const el = printRef.current;
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.innerHTML);
      setCopyFeedback("Copied HTML");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback("Copy failed");
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, []);

  const updateRow = useCallback(
    (index: number, patch: Partial<CompTemplateRow>) => {
      setRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  if (projectLoading || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading project…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex min-w-[240px] flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">Comparable</span>
              <select
                className="rounded border border-gray-300 px-2 py-1.5 text-gray-900"
                value={selectedCompId}
                onChange={(e) => {
                  const id = e.target.value;
                  router.replace(
                    `/project/${projectId}/${typeSlug}/ui?compId=${encodeURIComponent(id)}`,
                  );
                }}
              >
                {comparables.length === 0 ? (
                  <option value="">No comparables</option>
                ) : (
                  comparables.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      Comp {i + 1}
                      {c.address ? ` — ${c.address}` : ""}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void copyHtml()}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Copy
            </button>
            {copyFeedback ? (
              <span className="text-sm text-gray-600">{copyFeedback}</span>
            ) : null}
          </div>
          {parsedLoading ? (
            <p className="mt-2 text-sm text-gray-500">Loading parsed data…</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">
            Template rows
          </h2>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                key={`${row.fieldKey}-${index}`}
                className="flex flex-wrap items-center gap-2 border-b border-gray-100 py-2 last:border-0"
              >
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(e) =>
                      updateRow(index, { include: e.target.checked })
                    }
                  />
                  Include
                </label>
                <input
                  type="text"
                  className="min-w-[140px] flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                  value={row.label}
                  onChange={(e) =>
                    updateRow(index, { label: e.target.value })
                  }
                  placeholder="Label"
                  list={`raw-keys-label-${typeSlug}`}
                />
                <select
                  className="min-w-[160px] rounded border border-gray-300 px-2 py-1 text-sm"
                  value={row.fieldKey}
                  onChange={(e) =>
                    updateRow(index, { fieldKey: e.target.value })
                  }
                >
                  {!dataKeys.includes(row.fieldKey) ? (
                    <option value={row.fieldKey}>{row.fieldKey}</option>
                  ) : null}
                  {dataKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-600">
                  {readRawField(rawData, row.fieldKey) || "—"}
                </span>
              </div>
            ))}
          </div>
          <datalist id={`raw-keys-label-${typeSlug}`}>
            {dataKeys.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>

        <div
          ref={printRef}
          data-comp-ui={typeSlug}
          className="mx-auto max-w-5xl bg-white p-8 shadow-sm print:shadow-none"
        >
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold uppercase text-gray-900">
              {titleForCompType(compType)} NO. {displayIndex}
            </h1>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              {leftSections.map((section) => (
                <SectionRenderer key={section.title} title={section.title} items={section.items} />
              ))}
            </div>
            <div>
              {imageUrl ? (
                <div className="mb-6 overflow-hidden border border-gray-200 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Property"
                    className="h-64 w-full object-cover"
                  />
                </div>
              ) : (
                <div className="mb-6 flex h-64 items-center justify-center border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
                  No image
                </div>
              )}
              {keyIndicatorItems.length > 0 ? (
                <SectionRenderer title="Key Indicators" items={keyIndicatorItems} />
              ) : null}
            </div>
          </div>

          {commentsRow ? (
            <div className="mt-2">
              <SectionRenderer
                title="Comments"
                items={[
                  {
                    label: "",
                    value: readRawField(rawData, commentsRow.fieldKey),
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
