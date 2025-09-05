export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header Skeleton */}
        <div className="mb-8">
          <div className="mb-2 h-8 w-64 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-96 animate-pulse rounded bg-gray-200" />
        </div>

        {/* Photo Grid Skeleton */}
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
      </div>
    </div>
  );
}
