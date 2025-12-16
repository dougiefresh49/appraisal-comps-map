"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import type { ReactNode } from "react";

const navItems = [
  { segment: "neighborhood", label: "Neighborhood" },
  { segment: "zoning", label: "Zoning" },
  { segment: "subject-site-summary", label: "Subject Site Summary" },
  { segment: "highest-best-use", label: "Highest and Best Use" },
  { segment: "ownership", label: "Ownership" },
];

export default function ProjectReportsLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ projectId: string }> }>) {
  const pathname = usePathname();
  const { projectId } = use(params);
  // No need to decode for the link URL helper, but maybe for display?
  // The route params are usually encoded in the URL but decoded in the params object by Next.js?
  // Actually params.projectId is usually decoded by Next.js 15, but let's be safe or just use it as is for constructing URLs.
  // If we construct URLs, we should probably encode it just to be safe if it has spaces,
  // although Next.js links usually handle standard characters.
  // Let's assume projectId from params is safe to put back into a URL template or needs encoding if it has special chars.
  // Generally, constructing links: `/project/${projectId}/...`
  
  return (
    <div className="flex h-full bg-gray-50">
      <aside className="w-64 border-r border-gray-200 bg-white p-6 shadow-sm overflow-y-auto">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-gray-900">Reports</h1>
          <p className="text-xs text-gray-500">
            Generate and edit report sections.
          </p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const href = `/project/${projectId}/reports/${item.segment}`;
            const isActive = pathname?.startsWith(href);
            return (
              <Link
                key={item.segment}
                href={href}
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
          {/* Add explicit link to Neighborhood Map since it's related but technically outside reports folder in this new structure it is /project/[id]/neighborhood-map */}
          <Link
                href={`/project/${projectId}/neighborhood-map`}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition text-gray-700 hover:bg-gray-100`}
              >
                Neighborhood Map
          </Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
