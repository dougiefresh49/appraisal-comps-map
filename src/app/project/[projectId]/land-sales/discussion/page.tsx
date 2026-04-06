"use client";

import { ReportSectionPage } from "~/components/ReportSectionPage";

export default function LandSalesDiscussionPage() {
  return (
    <div className="p-6">
      <ReportSectionPage
        section="discussion-of-land-sales"
        title="Discussion of Land Sales"
        description="AI-generated discussion of land comparable sales organized by adjustment variable. Edit the draft, then use it in your report."
      />
    </div>
  );
}
