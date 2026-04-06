"use client";

import { ReportSectionPage } from "~/components/ReportSectionPage";

export default function SalesDiscussionPage() {
  return (
    <div className="p-6">
      <ReportSectionPage
        section="discussion-of-improved-sales"
        title="Discussion of Improved Sales"
        description="AI-generated discussion of improved comparable sales organized by adjustment variable. Edit the draft, then use it in your report."
      />
    </div>
  );
}
