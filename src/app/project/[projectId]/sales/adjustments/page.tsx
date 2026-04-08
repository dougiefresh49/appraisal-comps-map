import { AdjustmentGrid } from "~/components/AdjustmentGrid";

export default async function SalesAdjustmentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Sales Adjustment Grid
      </h1>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        AI-suggested adjustments from past reports. Edit any cell — changes auto-save.
      </p>
      <AdjustmentGrid projectId={projectId} compType="sales" />
    </div>
  );
}
