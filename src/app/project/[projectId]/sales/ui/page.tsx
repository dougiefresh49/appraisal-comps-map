"use client";

import React, { use } from "react";
import { useSearchParams } from "next/navigation";
import { useProject } from "~/hooks/useProject";

type Position = "left" | "right" | "full";

interface Item {
  label: string;
  value: string | number;
  highlight?: boolean; // For bolding values like Sale Price / SF
}

interface Section {
  title: string;
  position: Position;
  items: Item[];
}

interface PageData {
  title: string;
  imageUrl?: string;
  sections: Section[];
}

const MOCK_DATA: PageData = {
  title: "COMPARABLE SALE NO. 1",
  imageUrl: "https://photos.zillowstatic.com/fp/0d039234479e3778007a514d02633016-p_e.jpg", // Placeholder image or use a real one if available
  sections: [
    {
      title: "Property Information",
      position: "left",
      items: [
        { label: "Address", value: "4405 N County Road West\nOdessa, TX 79764" },
        { label: "APN", value: "34600.00551.00000" },
        {
          label: "Legal",
          value: "MARCO INDUSTRIAL SITES\nBLOCK 3 LOTS 16-17",
        },
        { label: "Type", value: "Industrial" },
        { label: "Land Size (AC)", value: 1.143 },
        { label: "Zoning", value: "None (Inside ETJ)" },
      ],
    },
    {
      title: "Property Improvements",
      position: "left",
      items: [
        { label: "Bld Size (SF)", value: "13,800" },
        { label: "Year Built", value: 1972 },
        { label: "Effective Age", value: 53.0 },
        { label: "Condition", value: "Average" },
        { label: "Land / Bld", value: 3.61 },
        { label: "Construction", value: "" },
        { label: "Other Features", value: "12'x12' (x2), 13'x12' (x2) Overhead Doors, No Wash Bay, Hoist Ready Hoisting. 3-phase power" },
      ],
    },
    {
      title: "Sale Information",
      position: "left",
      items: [
        { label: "Sale Price", value: "$700,000" },
        { label: "Date of Sale", value: "Jun 17, 2025" },
        { label: "Recording", value: "2025-00010087" },
        { label: "Grantor", value: "Noll Family Properties LLC" },
        { label: "Grantee", value: "Layman Sean LLC dba Lone Star Gasket" },
      ],
    },
    {
      title: "Income Analysis",
      position: "right",
      items: [
        { label: "Potential Gross Income", value: "$108,000" },
        { label: "Less: Vacancy", value: "-$10,800.00" },
        { label: "Effective Gross Income", value: "$97,200.00" },
        { label: "Less: Expenses", value: "-$23,206.04" },
        { label: "Net Operating Income", value: "$73,993.96" },
      ],
    },
    {
      title: "Key Indicators",
      position: "right",
      items: [
        { label: "Sale Price / SF", value: "$50.72", highlight: true },
        { label: "Occupancy %", value: "0%" },
        { label: "Gross Income Multiplier", value: "$7.20" },
        { label: "Overall Cap Rate", value: "10.57%", highlight: true },
      ],
    },
    {
      title: "Inputs",
      position: "right",
      items: [
        { label: "Rent / SF", value: "$7.83" },
        { label: "Vacancy %", value: "10%" },
      ],
    },
    {
      title: "Comments",
      position: "full",
      items: [
        {
          label: "",
          value:
            "Sold for $700,000 on 6/17/2025. 13,825 SF facility on 1.143 AC. Features front and rear loading doors, 3-phase power, and a hoist. Owner financing.",
        },
      ],
    },
  ],
};

function SectionRenderer({ section }: { section: Section }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 border-b border-gray-300 bg-gray-100 px-2 py-1 text-sm font-bold text-gray-900 uppercase">
        {section.title}
      </h3>
      <div className="px-2">
        {section.items.map((item, idx) => (
          <div key={idx} className="mb-1 grid grid-cols-[140px_1fr] gap-4 text-sm">
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

export default function SalesUIPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const searchParams = useSearchParams();
  const currentCompId = searchParams.get("compId");
  const { project } = useProject(projectId);
  
  const salesComparables = project?.comparables.byType.Sales?.comparables ?? [];
  
  // Find the index of the selected comparable
  const selectedIndex = currentCompId 
    ? salesComparables.findIndex(c => c.id === currentCompId) 
    : 0;
    
  // Use index + 1 for display, fallback to 1 if not found or list empty
  const displayIndex = selectedIndex >= 0 ? selectedIndex + 1 : 1;

  const leftSections = MOCK_DATA.sections.filter((s) => s.position === "left");
  const rightSections = MOCK_DATA.sections.filter((s) => s.position === "right");
  const fullSections = MOCK_DATA.sections.filter((s) => s.position === "full");

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-5xl bg-white p-8 shadow-sm print:shadow-none">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-gray-900 uppercase">
             COMPARABLE SALE NO. {displayIndex}
          </h1>
        </div>

        {/* Main Grid */}
        <div className="grid gap-8 md:grid-cols-2">
          {/* Left Column */}
          <div>
            {leftSections.map((section, idx) => (
              <SectionRenderer key={idx} section={section} />
            ))}
          </div>

          {/* Right Column */}
          <div>
            {/* Property Image */}
            {MOCK_DATA.imageUrl && (
              <div className="mb-6 overflow-hidden border border-gray-200 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={MOCK_DATA.imageUrl}
                  alt="Property"
                  className="h-64 w-full object-cover"
                />
              </div>
            )}
            {rightSections.map((section, idx) => (
              <SectionRenderer key={idx} section={section} />
            ))}
          </div>
        </div>

        {/* Full Width Sections */}
        <div className="mt-2">
          {fullSections.map((section, idx) => (
            <SectionRenderer key={idx} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
}
