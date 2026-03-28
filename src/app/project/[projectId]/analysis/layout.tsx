import type { ReactNode } from "react";

export default function AnalysisLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl p-8">
      {children}
    </div>
  );
}
