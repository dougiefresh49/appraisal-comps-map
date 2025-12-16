"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/reports/neighborhood", label: "Neighborhood" },
  { href: "/neighborhood-map", label: "Neighborhood Map" },
  { href: "/reports/zoning", label: "Zoning" },
  { href: "/reports/subject-site-summary", label: "Subject Site Summary" },
  { href: "/reports/highest-best-use", label: "Highest and Best Use" },
  { href: "/reports/ownership", label: "Ownership" },
];

export default function ReportsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-72 border-r border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-gray-900">Reports</h1>
          <p className="text-xs text-gray-500">
            Generate and edit report sections.
          </p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
