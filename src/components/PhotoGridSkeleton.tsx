export function PhotoGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md"
        >
          <div className="aspect-[3/2] animate-pulse bg-gray-200" />
          <div className="p-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
