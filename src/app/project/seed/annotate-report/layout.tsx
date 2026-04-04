import type { Viewport } from "next";
import type { ReactNode } from "react";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function AnnotateReportLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
