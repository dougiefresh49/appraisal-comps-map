import React from "react";
import { ParserSidebar } from "~/components/ParserSidebar";

interface ParserLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    projectId: string;
    type: string;
  }>;
}

export default async function ParserLayout({
  children,
  params,
}: ParserLayoutProps) {
  const { projectId, type } = await params;

  return (
    <div className="flex h-full bg-gray-50">
      <ParserSidebar projectId={projectId} type={type} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
