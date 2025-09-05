import * as React from "react";

interface Props {
  children: React.ReactNode;
}

export default function PhotosLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold text-gray-900">
              Photo Management
            </h1>
            <p className="text-gray-600">
              Drag and drop photos to reorder, click &quot;Edit&quot; to change
              labels, then save your changes.
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
